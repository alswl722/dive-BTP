"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { Company, Program } from "@/types";
import { useReviewStatus, useUi } from "@/lib/app-state";
import { DEFAULT_AXIS_WEIGHTS, DEFAULT_GROUP_WEIGHTS, DEFAULT_TECH_WEIGHTS } from "@/lib/scoring";
import { defaultFilters, applyFilters, sortCompanies, reviewStatusCounts, MAX_COMPARE, type CompanyFilters, type SortKey } from "@/lib/company-filters";
import { latestSupportYear } from "@/lib/duplicate-risk";
import { canReviewProgram, companyProgramKeys, programKey } from "@/lib/program-progress";
import { useAdminState } from "@/lib/admin-state";
import { useAuth } from "@/lib/auth";
import { FilterBar } from "@/components/companies/filter-bar";
import { AdvancedFilterPopover } from "@/components/companies/advanced-filter-popover";
import { Card } from "@/components/ui/card";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { WeightPopover } from "@/components/companies/weight-popover";
import { CompaniesTable } from "@/components/companies/companies-table";
import { CompaniesBoard } from "@/components/companies/companies-board";
import { CompareModal } from "@/components/companies/compare-modal";
import { ScorecardPanel } from "@/components/scorecard/scorecard-panel";
import { cn } from "@/lib/utils";
import { CompanyBatchExport } from "@/components/companies/company-batch-export";

// URL의 program=all — "전체 사업"(사업 필터 없이 전 기업 조회). null(=사업 미선택, 자동이동 대상)과
// 구분해야 하므로 쿼리 문자열 단계에서 별도 sentinel을 쓰고, 이 함수로만 실제 programKey로 변환한다.
const ALL_PROGRAMS = "all";
function programKeyFromQuery(raw: string | null): string | null {
  return raw && raw !== ALL_PROGRAMS ? raw : null;
}

export function CompaniesExplorer({ companies, programs }: { companies: Company[]; programs: Program[] }) {
  const { assigns } = useAdminState();
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { statusOf, setStatus } = useReviewStatus();
  const { viewMode, defaultWeights, setDefaultWeights } = useUi();

  const latestYear = useMemo(() => latestSupportYear(companies), [companies]);

  const [filters, setFilters] = useState<CompanyFilters>(() => ({
    ...defaultFilters(),
    q: searchParams.get("q") ?? "",
    dupRiskOnly: searchParams.get("dupRisk") === "1",
    qualityIssueOnly: searchParams.get("qualityIssue") === "1",
    programKey: programKeyFromQuery(searchParams.get("program")),
  }));
  // 이미 /companies에 머무른 채(같은 라우트, 리마운트 없음) 새 링크를 눌러 쿼리스트링만 바뀌는
  // 경우(대시보드 "이어서 심사하기", 다른 사업/필터 링크 재클릭 등)를 위 useState 초기값만으로는
  // 못 잡는다 — 그래서 searchParams 변경마다 관련 필드를 다시 동기화한다.
  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      q: searchParams.get("q") ?? "",
      dupRiskOnly: searchParams.get("dupRisk") === "1",
      qualityIssueOnly: searchParams.get("qualityIssue") === "1",
      programKey: programKeyFromQuery(searchParams.get("program")),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const [weights, setWeights] = useState(DEFAULT_AXIS_WEIGHTS);
  const [groupWeights, setGroupWeights] = useState(DEFAULT_GROUP_WEIGHTS);
  const [techWeights, setTechWeights] = useState(DEFAULT_TECH_WEIGHTS);
  // 저장된 기본 가중치를 최초 로드 시 한 번 적용(localStorage 복원이 비동기라 effect로).
  // 사용자가 이후 팝오버에서 바꾸면 defaultApplied 가드로 덮어쓰지 않는다.
  const defaultApplied = useRef(false);
  useEffect(() => {
    if (defaultWeights && !defaultApplied.current) {
      defaultApplied.current = true;
      setGroupWeights(defaultWeights.group);
      setWeights(defaultWeights.finance);
      setTechWeights(defaultWeights.tech);
    }
  }, [defaultWeights]);
  const [sortKey, setSortKey] = useState<SortKey>("overall");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [openId, setOpenId] = useState<number | null>(null);

  // 상세 프리뷰 패널 폭 — 왼쪽 라인 드래그로 조절. 최소 폭은 탭 6개·스탯카드가 안 깨지는 선.
  const PANEL_MIN = 420;
  const PANEL_MAX = 760;
  const [panelWidth, setPanelWidth] = useState(500);
  const panelDrag = useRef<{ startX: number; startW: number } | null>(null);

  const startPanelResize = (e: React.MouseEvent) => {
    e.preventDefault();
    panelDrag.current = { startX: e.clientX, startW: panelWidth };
    const onMove = (ev: MouseEvent) => {
      if (!panelDrag.current) return;
      const w = panelDrag.current.startW + (panelDrag.current.startX - ev.clientX);
      setPanelWidth(Math.min(PANEL_MAX, Math.max(PANEL_MIN, w)));
    };
    const onUp = () => {
      panelDrag.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };
  const [compareOpen, setCompareOpen] = useState(false);

  // 상태는 현재 선택된 사업(filters.programKey) 기준 — 같은 기업이 사업마다 다른 상태를 가진다.
  const companiesWithLiveStatus = useMemo(
    () => companies.map((c) => ({ ...c, reviewStatus: statusOf(c.id, filters.programKey) })),
    [companies, statusOf, filters.programKey]
  );

  const filtered = useMemo(
    () => applyFilters(companiesWithLiveStatus, filters, groupWeights, weights, latestYear, companyProgramKeys, techWeights),
    [companiesWithLiveStatus, filters, groupWeights, weights, latestYear, techWeights]
  );
  const sorted = useMemo(
    () => sortCompanies(filtered, sortKey, sortDir, groupWeights, weights, techWeights),
    [filtered, sortKey, sortDir, groupWeights, weights, techWeights]
  );
  // 상태 카운트는 "이 사업 신청 기업" 기준으로만 좁힌다 — 검색어·업종 등 다른 필터까지
  // 반영하면 그 필터를 건드릴 때마다 후보/선정/제외 총합이 흔들려 헷갈린다.
  const applicantsForCounts = useMemo(
    () =>
      filters.programKey
        ? companiesWithLiveStatus.filter((c) => companyProgramKeys(c).has(filters.programKey!))
        : companiesWithLiveStatus,
    [companiesWithLiveStatus, filters.programKey]
  );
  const counts = useMemo(() => reviewStatusCounts(applicantsForCounts), [applicantsForCounts]);

  // 조회는 전 직원에게 열려 있다 — 사업을 배정받지 않았어도 콤보박스에서 고를 수 있다.
  // 실제 심사 권한(선정/제외 등 상태 변경)은 canReviewCurrent로 별도 판단해 잠근다.
  const programOptions = useMemo(
    // localeCompare는 서버(Node ICU)와 브라우저의 콜레이션이 달라 hydration mismatch를 냄 —
    // 코드유닛 비교로 고정(한글 가나다 순서는 유니코드 순서와 동일).
    () => programs
      .filter((p) => p.applicantCount > 0)
      .sort((a, b) => b.year - a.year || ((a.name ?? "") < (b.name ?? "") ? -1 : (a.name ?? "") > (b.name ?? "") ? 1 : 0)),
    [programs]
  );
  // 조회 자체는 전 사업 공개지만, 실제로 심사를 진행할 사업은 대개 내 담당 사업이다 —
  // 전체 사업이 연도별로만 나열되면 담당 사업을 매번 스크롤해서 찾아야 한다. "내 담당
  // 사업" 그룹을 맨 위에 별도로 두고, 같은 사업이 아래 연도 그룹에도 그대로 남아있게 해
  // "전체에서 훑어보기"와 "내 사업 빨리 찾기"를 둘 다 지원한다.
  // 관리자는 isAdmin만으로 모든 사업을 심사할 수 있어(assigns 배정과 무관) 이 그룹에 넣으면
  // 연도별 그룹과 그대로 중복된다 — assigns에 실제로 이름이 적힌 사업만 "내 담당"으로 친다.
  const myProgramOptions = useMemo(
    () => programOptions.filter((p) => assigns[programKey(p)] === user?.username),
    [programOptions, assigns, user]
  );
  const programComboOptions: ComboboxOption[] = useMemo(
    () => [
      // 검색·필터가 특정 사업 신청 기업으로만 좁혀져 다른 사업 기업이 안 뜨는 문제 —
      // "전체 사업"을 고르면 사업 필터 없이 전체 기업에서 검색·필터링한다.
      { value: ALL_PROGRAMS, label: "전체 사업", group: "전체" },
      ...myProgramOptions.map((p) => ({ value: programKey(p), label: p.name ?? p.programCode, group: "내 담당 사업" })),
      ...programOptions.map((p) => ({ value: programKey(p), label: p.name ?? p.programCode, group: String(p.year) })),
    ],
    [programOptions, myProgramOptions]
  );
  // 현재 선택된 사업의 심사 권한 — 없으면(배정 안 됨, 관리자 아님) 상태 변경 버튼을 잠근다.
  const canReviewCurrent = canReviewProgram(user, assigns, filters.programKey);

  // 비교는 "지금 심사 중인 사업" 단위로만 — 사업 선택 없이는 비교 대상을 고를 수 없고,
  // 사업을 바꾸면 이전 사업에서 고른 선택은 버린다(섞여서 비교되는 것 방지).
  useEffect(() => {
    setSelectedIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.programKey]);

  function toggleSelect(id: number) {
    if (!filters.programKey) return;
    const company = companiesWithLiveStatus.find((c) => c.id === id);
    if (!company || !companyProgramKeys(company).has(filters.programKey)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_COMPARE) next.add(id);
      return next;
    });
  }

  function bulkSetStatus(status: "후보" | "선정" | "제외") {
    if (!filters.programKey || !canReviewCurrent) return; // 사업 단위 + 배정된 담당자·관리자만
    selectedIds.forEach((id) => setStatus(id, filters.programKey!, status));
    setSelectedIds(new Set());
  }

  function onSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const openCompany = sorted.find((c) => c.id === openId) ?? companiesWithLiveStatus.find((c) => c.id === openId) ?? null;
  // 프리뷰 패널에서 목록을 오가며 심사할 수 있도록 — 현재 정렬 순서 기준 이전/다음 기업
  const openIndex = openCompany ? sorted.findIndex((c) => c.id === openCompany.id) : -1;
  const prevCompany = openIndex > 0 ? sorted[openIndex - 1] : undefined;
  const nextCompany = openIndex >= 0 ? sorted[openIndex + 1] : undefined;
  const compareCompanies = companiesWithLiveStatus.filter((c) => selectedIds.has(c.id));

  return (
    <div className="flex items-start gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <Card className="flex flex-wrap items-center gap-2.5 p-2.5">
          {/* 심사는 사업 단위로 진행 — 조회는 전 직원에게 열려 있어 모든 사업을 고를 수 있다.
              배정된 담당자·관리자가 아니면 선정/제외 등 상태 변경만 잠긴다(canReviewCurrent).
              사업 목록 카드 페이지는 없앴으므로 전환은 이 콤보박스로만 한다.
              사업 이름 → 업종 → 인증 → 축가중치 → 필터 → 데이터 품질 이슈 제외 순서로 고정. */}
          <Combobox
            options={programComboOptions}
            value={filters.programKey ?? ALL_PROGRAMS}
            onChange={(key) => router.push(`/companies?program=${key}`)}
            placeholder="사업 선택"
            className="w-[260px] shrink-0"
          />

          <FilterBar companies={companies} filters={filters} onChange={setFilters} />

          <WeightPopover
            weights={weights}
            onChange={setWeights}
            groupWeights={groupWeights}
            onGroupChange={setGroupWeights}
            techWeights={techWeights}
            onTechChange={setTechWeights}
            onSaveDefault={(w) => {
              setGroupWeights(w.group);
              setWeights(w.finance);
              setTechWeights(w.tech);
              defaultApplied.current = true; // 저장 후엔 자동 적용 로직이 덮어쓰지 않게
              setDefaultWeights(w);
            }}
          />

          <AdvancedFilterPopover filters={filters} onChange={setFilters} />

          <CompanyBatchExport companies={companies} programs={programs} />

          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[12px] text-muted-foreground">
            <input
              type="checkbox"
              checked={filters.excludeQualityIssues}
              onChange={(e) => setFilters({ ...filters, excludeQualityIssues: e.target.checked, qualityIssueOnly: false })}
              className="h-3.5 w-3.5 accent-primary"
            />
            데이터 품질 이슈 제외
          </label>

          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[12px] text-muted-foreground">
            <input
              type="checkbox"
              checked={filters.sizeMismatchOnly}
              onChange={(e) => setFilters({ ...filters, sizeMismatchOnly: e.target.checked })}
              className="h-3.5 w-3.5 accent-primary"
            />
            신고규모 불일치만
          </label>

          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[12px] text-muted-foreground">
            <input
              type="checkbox"
              checked={filters.employmentRiskOnly}
              onChange={(e) => setFilters({ ...filters, employmentRiskOnly: e.target.checked })}
              className="h-3.5 w-3.5 accent-primary"
            />
            고용 불안정
          </label>

          <div className="ml-auto flex items-center gap-2 text-[12px] text-muted-foreground">
            {!filters.programKey && <span>사업을 선택하면 기업을 비교할 수 있어요 ·</span>}
            <CountPill label="후보" value={counts.후보} tone="text-info" />
            <CountPill label="선정" value={counts.선정} tone="text-good" />
            <CountPill label="제외" value={counts.제외} tone="text-bad" />
            <span>/ <span className="font-bold text-foreground">{applicantsForCounts.length}</span>개 기업</span>
          </div>
        </Card>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 rounded-lg bg-primary px-4 py-2.5 text-primary-foreground">
            <span className="text-[12.5px] font-medium">{selectedIds.size}개 선택됨</span>
            <div className="ml-auto flex items-center gap-2">
              {canReviewCurrent ? (
                <>
                  <BulkButton onClick={() => bulkSetStatus("선정")}>선정 처리</BulkButton>
                  <BulkButton onClick={() => bulkSetStatus("제외")}>제외 처리</BulkButton>
                  <BulkButton onClick={() => bulkSetStatus("후보")}>후보 처리</BulkButton>
                </>
              ) : (
                <span className="text-[11.5px] text-white/80">
                  {filters.programKey ? "배정된 담당자만 상태 변경 가능" : "사업을 선택해야 상태 변경 가능"}
                </span>
              )}
              <button
                onClick={() => setCompareOpen(true)}
                disabled={selectedIds.size < 2}
                className="rounded-md bg-white px-3 py-1 text-[12px] font-medium text-primary disabled:opacity-50"
              >
                비교 ({selectedIds.size})
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="text-white/80 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <div className="flex min-h-0 flex-1 gap-4">
          <div
            className="min-w-0 flex-1"
            style={openId ? { maxWidth: `calc(100% - ${panelWidth + 16}px)` } : undefined}
          >
            {viewMode === "table" ? (
              <CompaniesTable
                companies={sorted}
                weights={weights}
                groupWeights={groupWeights}
                techWeights={techWeights}
                latestYear={latestYear}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                compareDisabled={!filters.programKey}
                onOpenDetail={setOpenId}
                openId={openId}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
            ) : (
              <CompaniesBoard
                companies={sorted}
                weights={weights}
                groupWeights={groupWeights}
                techWeights={techWeights}
                latestYear={latestYear}
                onSetStatus={(id, status) => {
                  if (filters.programKey && canReviewCurrent) setStatus(id, filters.programKey, status);
                }}
                canReview={canReviewCurrent}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                compareDisabled={!filters.programKey}
                onOpenDetail={setOpenId}
              />
            )}
          </div>

          {openCompany && (
            <div className="sticky top-6 shrink-0" style={{ width: panelWidth }}>
              {/* 왼쪽 라인 드래그 핸들 — 스크롤 컨테이너 밖에 둬야 스크롤해도 핸들이 따라 내려가지 않음 */}
              <div
                onMouseDown={startPanelResize}
                className="absolute -left-1.5 top-0 z-10 h-full w-3 cursor-col-resize rounded-full transition-colors hover:bg-primary/15 active:bg-primary/25"
                role="separator"
                aria-orientation="vertical"
                aria-label="프리뷰 폭 조절"
              />
              <div className="max-h-[calc(100vh-100px)] overflow-y-auto rounded-xl bg-card p-5 shadow-modal">
                <ScorecardPanel
                  company={openCompany}
                  latestYear={latestYear}
                  programKey={filters.programKey}
                  weights={weights}
                  groupWeights={groupWeights}
                  techWeights={techWeights}
                  onClose={() => setOpenId(null)}
                  onExpand={() => router.push(`/companies/${openCompany.id}`)}
                />
              </div>
              {/* 목록으로 안 돌아가고 바로 이전/다음 기업으로 — 내용을 가리지 않도록 반투명 원형 버튼.
                  왼쪽은 폭 조절 핸들과 같은 자리라 z-index를 더 높여 버튼 클릭이 우선되게 한다. */}
              {prevCompany && (
                <button
                  onClick={() => setOpenId(prevCompany.id)}
                  title={`이전 기업: ${prevCompany.name}`}
                  className="absolute -left-3 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-foreground/10 text-foreground/60 shadow-sm backdrop-blur-sm transition-colors hover:bg-foreground/20 hover:text-foreground"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              {nextCompany && (
                <button
                  onClick={() => setOpenId(nextCompany.id)}
                  title={`다음 기업: ${nextCompany.name}`}
                  className="absolute -right-3 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-foreground/10 text-foreground/60 shadow-sm backdrop-blur-sm transition-colors hover:bg-foreground/20 hover:text-foreground"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {compareOpen && compareCompanies.length >= 2 && (
        <CompareModal
          companies={compareCompanies}
          weights={weights}
          groupWeights={groupWeights}
          techWeights={techWeights}
          latestYear={latestYear}
          onSetStatus={(id, status) => {
            if (filters.programKey) setStatus(id, filters.programKey, status);
          }}
          onRemove={(id) => setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; })}
          onClose={() => setCompareOpen(false)}
        />
      )}
    </div>
  );
}

function CountPill({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className={cn("font-bold tabular-nums", tone)}>{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function BulkButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="rounded-md bg-white/15 px-2.5 py-1 text-[12px] font-medium hover:bg-white/25">
      {children}
    </button>
  );
}

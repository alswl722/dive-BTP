"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, ChevronUp, Download, Search, X } from "lucide-react";
import type { Company, Note, Program } from "@/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { useAdminState } from "@/lib/admin-state";
import { businessTypeLabel, resolveProgramStatus, PROGRAM_STATUS_BADGE, type ProgramStatus } from "@/lib/program-status";
import { ProgramDetailPanel } from "@/components/programs/program-detail-panel";
import {
  applyProgramFilters, bizTypeKey, csvFileName, defaultProgramFilters, downloadCsv,
  overlapCompanyCount, programKeyOf, programsToCsv, sortPrograms, summarizePrograms,
  type ProgramFilters, type ProgramSortKey, type SortDir,
} from "@/lib/program-filters";
import { formatKRW, cn } from "@/lib/utils";

const PAGE_SIZE = 15;
const STATUSES: ProgramStatus[] = ["진행중", "예정", "완료"];

export function ProgramsExplorer({
  programs,
  companies,
  notes,
  referenceDateIso,
}: {
  programs: Program[];
  companies: Company[];
  notes: Note[];
  referenceDateIso: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const referenceDate = useMemo(() => new Date(referenceDateIso + "T00:00:00"), [referenceDateIso]);

  const [filters, setFilters] = useState<ProgramFilters>(() => ({
    ...defaultProgramFilters(),
    year: searchParams.get("year") ?? "전체",
  }));
  const [sortKey, setSortKey] = useState<ProgramSortKey>("year");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [openKey, setOpenKey] = useState<string | null>(null);

  // /programs에 머무른 채 연도만 다른 링크(대시보드 "마감 임박 사업" 등)를 다시 누르면
  // 컴포넌트가 리마운트되지 않아 위 useState 초기값이 재실행되지 않는다 — 매번 동기화.
  useEffect(() => {
    setFilters((f) => ({ ...f, year: searchParams.get("year") ?? "전체" }));
  }, [searchParams]);

  const years = useMemo(() => Array.from(new Set(programs.map((p) => p.year))).sort((a, b) => b - a), [programs]);

  const businessTypes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of programs) counts.set(bizTypeKey(p), (counts.get(bizTypeKey(p)) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [programs]);

  const ministries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of programs) {
      const k = p.ministry ?? "미상";
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [programs]);

  // 관리자가 지정한 진행 상태를 목록·필터·CSV에 반영한다
  const { statuses: adminStatuses } = useAdminState();

  const detailOptions = useMemo(() => {
    const pool = filters.businessType
      ? programs.filter((p) => bizTypeKey(p) === filters.businessType)
      : programs;
    return Array.from(new Set(pool.flatMap((p) => p.detailItems))).sort();
  }, [programs, filters.businessType]);

  const filtered = useMemo(
    () => applyProgramFilters(programs, filters, referenceDate, adminStatuses),
    [programs, filters, referenceDate, adminStatuses]
  );
  const sorted = useMemo(() => sortPrograms(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);
  const summary = useMemo(() => summarizePrograms(filtered), [filtered]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageItems = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const openProgram = useMemo(
    () => (openKey ? programs.find((p) => programKeyOf(p) === openKey) ?? null : null),
    [openKey, programs]
  );

  function update(patch: Partial<ProgramFilters>) {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(0);
  }

  function onSort(key: ProgramSortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
    setPage(0);
  }

  const hasFilter =
    filters.q !== "" || filters.year !== "전체" || filters.businessType !== null ||
    filters.detailItem !== null || filters.ministry !== null || filters.status !== null;

  return (
    <div className="space-y-4">
      {/* 제목 줄 오른쪽에 요약·CSV를 얹어 별도 행을 쓰지 않는다 */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h1 className="text-xl font-bold">지원 사업</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-bold text-foreground">{summary.count}건</span>
            {summary.count !== programs.length && <span> / 전체 {programs.length}건</span>}
            <span className="mx-1.5 text-muted-foreground/40">·</span>
            선정 <span className="tabular-nums">{summary.selectedTotal}</span>개사
            <span className="mx-1.5 text-muted-foreground/40">·</span>
            지원금 <span className="tabular-nums">{formatKRW(summary.totalAmountThousand)}</span>
            <span className="mx-1.5 text-muted-foreground/40">·</span>
            <span title="나머지는 보유 데이터에 신청 기록이 없는 사업입니다">
              신청기록 <span className="tabular-nums">{summary.withRecords}</span>건
            </span>
          </p>
        </div>
        <button
          onClick={() => downloadCsv(programsToCsv(sorted, referenceDate, adminStatuses), csvFileName(filters, new Date()))}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-[12px] font-medium hover:bg-muted"
        >
          <Download className="h-3.5 w-3.5" />
          CSV 내보내기
        </button>
      </div>

      {/* 필터 바 — flex-nowrap 고정: 폭이 모자라면 줄바꿈 대신 사업유형 그룹만 가로 스크롤 */}
      <Card className="space-y-2.5 p-2.5">
        <div className="flex flex-nowrap items-center gap-2">
          <div className="relative w-[220px] shrink-0">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={filters.q}
              onChange={(e) => update({ q: e.target.value })}
              placeholder="사업명·코드 검색"
              aria-label="사업명 검색"
              className="w-full rounded-md border bg-subtle py-1.5 pl-8 pr-7 text-[12px] outline-none focus:ring-2 focus:ring-ring/40"
            />
            {filters.q && (
              <button
                onClick={() => update({ q: "" })}
                aria-label="검색어 지우기"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted p-1">
            {["전체", ...years.map(String)].map((y) => (
              <SegmentButton key={y} active={filters.year === y} onClick={() => update({ year: y })}>
                {y === "전체" ? "전체" : `${y}년`}
              </SegmentButton>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted p-1">
            <SegmentButton active={filters.status === null} onClick={() => update({ status: null })}>
              전체
            </SegmentButton>
            {STATUSES.map((s) => (
              <SegmentButton key={s} active={filters.status === s} onClick={() => update({ status: s })}>
                {s}
              </SegmentButton>
            ))}
          </div>

          <select
            value={filters.ministry ?? ""}
            onChange={(e) => update({ ministry: e.target.value || null })}
            aria-label="부처 필터"
            className="shrink-0 rounded-md border bg-subtle px-2 py-1.5 text-[12px] outline-none focus:ring-2 focus:ring-ring/40"
          >
            <option value="">부처 전체</option>
            {ministries.map(([m, n]) => (
              <option key={m} value={m}>{m} ({n})</option>
            ))}
          </select>

          <select
            value={filters.detailItem ?? ""}
            onChange={(e) => update({ detailItem: e.target.value || null })}
            aria-label="지원구분 필터"
            className="shrink-0 rounded-md border bg-subtle px-2 py-1.5 text-[12px] outline-none focus:ring-2 focus:ring-ring/40"
          >
            <option value="">지원구분 전체</option>
            {detailOptions.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-nowrap items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-lg bg-muted p-1">
            <SegmentButton
              active={filters.businessType === null}
              onClick={() => update({ businessType: null, detailItem: null })}
            >
              전체
            </SegmentButton>
            {businessTypes.map(([bt]) => (
              <SegmentButton
                key={bt}
                active={filters.businessType === bt}
                onClick={() => update({ businessType: bt, detailItem: null })}
              >
                {businessTypeLabel(bt === "미분류" ? null : bt)}
              </SegmentButton>
            ))}
          </div>
          {hasFilter && (
            <button
              onClick={() => { setFilters(defaultProgramFilters()); setPage(0); }}
              className="shrink-0 text-[12px] text-primary hover:underline"
            >
              초기화
            </button>
          )}
        </div>
      </Card>

      <div className="flex min-h-0 gap-4">
        <div className="min-w-0 flex-1">
          <Card>
            <Table>
              <THead>
                <TR>
                  <SortableTH label="사업명" k="name" cur={sortKey} dir={sortDir} onSort={onSort} />
                  <TH>사업유형</TH>
                  <TH>세부 품목</TH>
                  <TH className="text-center">상태</TH>
                  <SortableTH label="선정 기업 수" k="selected" cur={sortKey} dir={sortDir} onSort={onSort} align="center" />
                  <SortableTH label="총 지원금" k="amount" cur={sortKey} dir={sortDir} onSort={onSort} align="center" />
                  <SortableTH label="연도" k="year" cur={sortKey} dir={sortDir} onSort={onSort} align="center" />
                  <TH className="text-center">상세</TH>
                </TR>
              </THead>
              <TBody>
                {pageItems.map((p) => {
                  const status = resolveProgramStatus(p, referenceDate, adminStatuses);
                  const overlap = overlapCompanyCount(p, companies);
                  const key = programKeyOf(p);
                  return (
                    <TR
                      key={key}
                      className={cn("cursor-pointer", openKey === key && "bg-muted/50")}
                      onClick={() => setOpenKey(key)}
                    >
                      <TD>
                        <p className="font-medium">{p.name ?? p.programCode}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.applicantCount === 0 ? "신청 기록 없음" : `신청기업 ${p.applicantCount}개`}
                          {overlap > 0 && (
                            <span className="ml-1.5 text-[hsl(30_75%_38%)]" title="선정 기업 중 다른 사업에서도 선정된 기업 수">
                              · 중복 {overlap}개사
                            </span>
                          )}
                        </p>
                      </TD>
                      <TD>
                        <Badge variant="info">{businessTypeLabel(p.businessType)}</Badge>
                      </TD>
                      <TD className="text-muted-foreground">{p.detailItems.slice(0, 2).join(", ") || "—"}</TD>
                      <TD className="text-center">
                        <Badge variant={PROGRAM_STATUS_BADGE[status]}>{status}</Badge>
                      </TD>
                      <TD className="text-center tabular-nums">
                        <SelectedCountCell program={p} />
                      </TD>
                      <TD className="text-center tabular-nums">
                        <TotalAmountCell program={p} />
                      </TD>
                      <TD className="text-center tabular-nums text-muted-foreground">{p.year}</TD>
                      <TD className="text-center">
                        <ChevronRight className="mx-auto h-4 w-4 text-muted-foreground" />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            {pageItems.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">조건에 맞는 사업이 없습니다.</p>
            )}
          </Card>

          <div className="mt-4">
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          </div>
        </div>

        {openProgram && (
          <div className="sticky top-6 max-h-[calc(100vh-100px)] w-[380px] shrink-0 overflow-y-auto rounded-xl bg-card p-5 shadow-modal">
            <ProgramDetailPanel
              program={openProgram}
              programs={programs}
              companies={companies}
              notes={notes}
              referenceDate={referenceDate}
              onClose={() => setOpenKey(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** 선정 기업 수 — "0"에는 서로 다른 두 의미가 섞인다.
 *  ① 신청 기록 자체가 없음 ② 신청은 있었으나 전원 탈락/포기(실제 신호). */
function SelectedCountCell({ program: p }: { program: Program }) {
  if (p.applicantCount === 0) {
    return <span className="text-muted-foreground" title="이 사업에 매칭된 신청 기록이 없습니다">—</span>;
  }
  if (p.selectedCount === 0) {
    return (
      <span className="font-medium text-warn" title={`신청 ${p.applicantCount}개 · 전원 탈락/포기`}>0</span>
    );
  }
  return <span>{p.selectedCount}</span>;
}

/** 총 지원금 — 합계는 결측을 0으로 더하므로 "0원"과 "미기재"가 구분되지 않는다. */
function TotalAmountCell({ program: p }: { program: Program }) {
  if (p.applicantCount === 0 || p.selectedCount === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  const missing = p.amountMissingCount ?? 0;
  if (missing > 0) {
    // 프리뷰 패널이 열려 칼럼이 좁아지면 금액과 *가 갈라져 다음 줄로 떨어진다 — 한 덩어리로 묶는다.
    return (
      <span
        className="whitespace-nowrap"
        title={`선정 ${p.selectedCount}건 중 ${missing}건은 지원금 미기재 — 합계에서 제외됨`}
      >
        {formatKRW(p.totalAmountThousand)}
        <span className="ml-0.5 text-warn">*</span>
      </span>
    );
  }
  return <span>{formatKRW(p.totalAmountThousand)}</span>;
}

function SortableTH({
  label, k, cur, dir, onSort, align = "left",
}: {
  label: string;
  k: ProgramSortKey;
  cur: ProgramSortKey;
  dir: SortDir;
  onSort: (k: ProgramSortKey) => void;
  align?: "left" | "center";
}) {
  const active = cur === k;
  return (
    <TH className={align === "center" ? "text-center" : undefined}>
      <button
        onClick={() => onSort(k)}
        className={cn(
          "inline-flex items-center gap-0.5 transition-colors hover:text-foreground",
          active ? "font-bold text-foreground" : ""
        )}
      >
        {label}
        <ChevronUp
          className={cn(
            "h-3 w-3 transition-transform",
            active ? (dir === "desc" ? "rotate-180" : "") : "opacity-0"
          )}
        />
      </button>
    </TH>
  );
}

function SegmentButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-[12px] font-medium transition-colors",
        active ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

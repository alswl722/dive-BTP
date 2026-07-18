"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { List, X } from "lucide-react";
import type { Company, Program } from "@/types";
import { useReviewStatus, useUi } from "@/lib/app-state";
import { DEFAULT_AXIS_WEIGHTS } from "@/lib/scoring";
import { defaultFilters, applyFilters, sortCompanies, reviewStatusCounts, type CompanyFilters, type SortKey } from "@/lib/company-filters";
import { latestSupportYear } from "@/lib/duplicate-risk";
import { companyProgramKeys, programKey } from "@/lib/program-progress";
import { FilterPanel } from "@/components/companies/filter-panel";
import { WeightPopover } from "@/components/companies/weight-popover";
import { CompaniesTable } from "@/components/companies/companies-table";
import { CompaniesBoard } from "@/components/companies/companies-board";
import { CompareModal } from "@/components/companies/compare-modal";
import { ScorecardPanel } from "@/components/scorecard/scorecard-panel";
import { cn } from "@/lib/utils";

export function CompaniesExplorer({ companies, programs }: { companies: Company[]; programs: Program[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { statuses, setStatus } = useReviewStatus();
  const { viewMode } = useUi();

  const latestYear = useMemo(() => latestSupportYear(companies), [companies]);

  const [filters, setFilters] = useState<CompanyFilters>(() => ({
    ...defaultFilters(),
    q: searchParams.get("q") ?? "",
    dupRiskOnly: searchParams.get("dupRisk") === "1",
    qualityIssueOnly: searchParams.get("qualityIssue") === "1",
    programKey: searchParams.get("program"),
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
      programKey: searchParams.get("program"),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const [filterPanelOpen, setFilterPanelOpen] = useState(true);
  const [weights, setWeights] = useState(DEFAULT_AXIS_WEIGHTS);
  const [sortKey, setSortKey] = useState<SortKey>("overall");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [openId, setOpenId] = useState<number | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);

  const companiesWithLiveStatus = useMemo(
    () => companies.map((c) => ({ ...c, reviewStatus: statuses[c.id] ?? c.reviewStatus })),
    [companies, statuses]
  );

  const filtered = useMemo(
    () => applyFilters(companiesWithLiveStatus, filters, weights, latestYear, companyProgramKeys),
    [companiesWithLiveStatus, filters, weights, latestYear]
  );
  const sorted = useMemo(() => sortCompanies(filtered, sortKey, sortDir, weights), [filtered, sortKey, sortDir, weights]);
  const counts = useMemo(() => reviewStatusCounts(companiesWithLiveStatus, statuses), [companiesWithLiveStatus, statuses]);

  const programOptions = useMemo(
    () => programs.filter((p) => p.applicantCount > 0).sort((a, b) => b.year - a.year || (a.name ?? "").localeCompare(b.name ?? "")),
    [programs]
  );
  const selectedProgram = programOptions.find((p) => programKey(p) === filters.programKey);

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
      return next;
    });
  }

  function bulkSetStatus(status: "선정" | "보류" | "제외") {
    selectedIds.forEach((id) => setStatus(id, status));
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
  const compareCompanies = companiesWithLiveStatus.filter((c) => selectedIds.has(c.id));

  return (
    <div className="flex items-start gap-4">
      {filterPanelOpen && (
        <FilterPanel companies={companies} filteredCount={sorted.length} filters={filters} onChange={setFilters} />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setFilterPanelOpen((v) => !v)}
            title="필터 패널 접기/펼치기"
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
              filterPanelOpen ? "border-primary text-primary" : "text-muted-foreground hover:bg-muted"
            )}
          >
            <List className="h-4 w-4" />
          </button>

          <select
            value={filters.programKey ?? ""}
            onChange={(e) => setFilters({ ...filters, programKey: e.target.value || null })}
            className="rounded-md border bg-subtle px-2.5 py-1.5 text-[12.5px] outline-none focus:ring-2 focus:ring-ring/40"
          >
            <option value="">전체 사업</option>
            {programOptions.map((p) => (
              <option key={programKey(p)} value={programKey(p)}>
                {p.year} · {p.name}
              </option>
            ))}
          </select>

          <WeightPopover weights={weights} onChange={setWeights} />

          {selectedProgram && (
            <button
              onClick={() => setFilters({ ...filters, programKey: null })}
              className="flex items-center gap-1 rounded-full bg-info-bg px-2.5 py-1 text-[11.5px] text-info"
            >
              {selectedProgram.name} <X className="h-3 w-3" />
            </button>
          )}

          <div className="ml-auto flex items-center gap-2 text-[12px]">
            <CountPill label="후보" value={counts.후보} tone="text-info" />
            <CountPill label="선정" value={counts.선정} tone="text-good" />
            <CountPill label="제외" value={counts.제외} tone="text-bad" />
            <span className="text-muted-foreground">/ {companies.length}개</span>
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 rounded-lg bg-primary px-4 py-2.5 text-primary-foreground">
            <span className="text-[12.5px] font-medium">{selectedIds.size}개 선택됨</span>
            <div className="ml-auto flex items-center gap-2">
              <BulkButton onClick={() => bulkSetStatus("선정")}>선정 처리</BulkButton>
              <BulkButton onClick={() => bulkSetStatus("보류")}>보류 처리</BulkButton>
              <BulkButton onClick={() => bulkSetStatus("제외")}>제외 처리</BulkButton>
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
          <div className={cn("min-w-0 flex-1", openId && "max-w-[calc(100%-420px)]")}>
            {viewMode === "table" ? (
              <CompaniesTable
                companies={sorted}
                weights={weights}
                latestYear={latestYear}
                statuses={statuses}
                onSetStatus={setStatus}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
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
                latestYear={latestYear}
                statuses={statuses}
                onSetStatus={setStatus}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onOpenDetail={setOpenId}
              />
            )}
          </div>

          {openCompany && (
            <div className="sticky top-6 max-h-[calc(100vh-100px)] w-[400px] shrink-0 overflow-y-auto rounded-xl bg-card p-5 shadow-modal">
              <ScorecardPanel
                company={openCompany}
                latestYear={latestYear}
                weights={weights}
                onClose={() => setOpenId(null)}
                onExpand={() => router.push(`/companies/${openCompany.id}`)}
              />
            </div>
          )}
        </div>
      </div>

      {compareOpen && compareCompanies.length >= 2 && (
        <CompareModal
          companies={compareCompanies}
          weights={weights}
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

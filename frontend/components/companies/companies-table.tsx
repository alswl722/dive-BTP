"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import type { Axis, Company, CompositeGroup, ReviewStatus } from "@/types";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/ui/score-badge";
import { AxisMiniBars } from "@/components/companies/axis-mini-bars";
import { resolveOverallScore } from "@/lib/scoring";
import { cn } from "@/lib/utils";
import type { SortDir, SortKey } from "@/lib/company-filters";

/** 심사 상태 → 뱃지 색. 컬럼을 없애고 기업명 옆에 붙이면서 한 곳으로 모았다. */
const STATUS_VARIANT: Record<ReviewStatus, "good" | "bad" | "secondary"> = {
  선정: "good",
  제외: "bad",
  후보: "secondary",
};

const PAGE_SIZE = 8;
const MAX_COMPARE = 4;

export function CompaniesTable({
  companies,
  weights,
  groupWeights,
  selectedIds,
  onToggleSelect,
  onOpenDetail,
  openId,
  sortKey,
  sortDir,
  onSort,
}: {
  companies: Company[];
  weights: Record<Axis, number>;
  groupWeights: Record<CompositeGroup, number>;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onOpenDetail: (id: number) => void;
  openId: number | null;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const [page, setPage] = useState(0);
  // companies는 부모에서 필터/정렬/가중치 변경마다 새 배열로 memo되므로, 내용이나 순서가 바뀌면
  // (예: 가중치 조정으로 재정렬만 되고 길이는 그대로인 경우도) 여기서 항상 1페이지로 리셋된다.
  useEffect(() => setPage(0), [companies]);

  const totalPages = Math.max(1, Math.ceil(companies.length / PAGE_SIZE));
  const pageItems = companies.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-3">
      <Table>
        <THead>
          <TR>
            <TH className="w-8"></TH>
            {/* 폭 명시 — 자동 배분 시 이 열이 남는 공간을 다 흡수해 최근매출과 사이가 벌어지던 문제 해소 */}
            <TH className="w-[260px]">기업 · 업종</TH>
            <SortableTH label="종합점수" active={sortKey === "overall"} dir={sortDir} onClick={() => onSort("overall")} />
            <TH className="w-[172px]">4축 점수</TH>
            <SortableTH label="R&D 점수" active={sortKey === "techScore"} dir={sortDir} onClick={() => onSort("techScore")} />
            <SortableTH label="지원건수" active={sortKey === "supportCount"} dir={sortDir} onClick={() => onSort("supportCount")} />
          </TR>
        </THead>
        <TBody>
          {pageItems.map((c) => {
            const status = c.reviewStatus;
            return (
              <TR
                key={c.id}
                onClick={() => onOpenDetail(c.id)}
                className={cn("cursor-pointer", openId === c.id && "bg-info-bg/40")}
              >
                <TD onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id)}
                    disabled={!selectedIds.has(c.id) && selectedIds.size >= MAX_COMPARE}
                    onChange={() => onToggleSelect(c.id)}
                    className="h-3.5 w-3.5 accent-primary"
                  />
                </TD>
                <TD>
                  {/* 상태는 별도 컬럼 대신 기업명 옆 뱃지로 — 변경은 상세 패널·일괄 처리에서 */}
                  <p className="flex items-center gap-1.5 font-medium">
                    <span className="truncate">{c.name}</span>
                    <Badge variant={STATUS_VARIANT[status]} className="shrink-0 px-1.5 py-0 text-[10px]">
                      {status}
                    </Badge>
                  </p>
                  <p className="max-w-[220px] truncate text-[11px] text-muted-foreground">{c.industry ?? "-"}</p>
                </TD>
                <TD>
                  <ScoreBadge score={resolveOverallScore(c, groupWeights, weights)} size="sm" />
                </TD>
                <TD>
                  <AxisMiniBars scores={c.scores} />
                </TD>
                <TD>
                  {/* 축4 R&D·특허 점수. 기술 데이터가 없는 기업은 0이 아니라 '-' */}
                  <ScoreBadge score={c.tech?.scores.rndPatent ?? null} size="sm" />
                </TD>
                <TD className="tabular-nums">{c.support.건수 ?? 0}건</TD>
              </TR>
            );
          })}
        </TBody>
      </Table>

      {pageItems.length === 0 && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Info className="h-4 w-4" /> 조건에 맞는 기업이 없습니다.
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

function SortableTH({ label, active, dir, onClick }: { label: string; active: boolean; dir: SortDir; onClick: () => void }) {
  return (
    <TH>
      <button onClick={onClick} className={cn("inline-flex items-center gap-0.5", active && "text-primary")}>
        {label}
        {active && (dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
      </button>
    </TH>
  );
}

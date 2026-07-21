"use client";

import { useState } from "react";
import { AlertTriangle, Eye } from "lucide-react";
import type { Axis, Company, CompositeGroup, ReviewStatus } from "@/types";
import { Card } from "@/components/ui/card";
import { ScoreBadge } from "@/components/ui/score-badge";
import { StatusDropdown } from "@/components/scorecard/status-buttons";
import { AxisMiniBars } from "@/components/companies/axis-mini-bars";
import { resolveOverallScore, DEFAULT_TECH_WEIGHTS, type TechAxis } from "@/lib/scoring";
import { isDuplicateRisk } from "@/lib/duplicate-risk";
import { formatKRW, cn } from "@/lib/utils";

const MAX_COMPARE = 4;
const COLUMNS: { status: ReviewStatus; label: string; tone: string }[] = [
  { status: "후보", label: "후보", tone: "text-info" },
  { status: "선정", label: "선정", tone: "text-good" },
  { status: "제외", label: "제외", tone: "text-bad" },
];

export function CompaniesBoard({
  companies,
  weights,
  groupWeights,
  techWeights = DEFAULT_TECH_WEIGHTS,
  latestYear,
  onSetStatus,
  selectedIds,
  onToggleSelect,
  onOpenDetail,
}: {
  companies: Company[];
  weights: Record<Axis, number>;
  groupWeights: Record<CompositeGroup, number>;
  techWeights?: Record<TechAxis, number>;
  latestYear: number;
  onSetStatus: (id: number, status: ReviewStatus) => void;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onOpenDetail: (id: number) => void;
}) {
  const [dragOverCol, setDragOverCol] = useState<ReviewStatus | null>(null);

  return (
    <div className="grid grid-cols-3 gap-4">
      {COLUMNS.map(({ status, label, tone }) => {
        const items = companies.filter((c) => c.reviewStatus === status);
        return (
          <div
            key={status}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverCol(status);
            }}
            onDragLeave={() => setDragOverCol((cur) => (cur === status ? null : cur))}
            onDrop={(e) => {
              e.preventDefault();
              const id = Number(e.dataTransfer.getData("text/company-id"));
              if (Number.isFinite(id)) onSetStatus(id, status);
              setDragOverCol(null);
            }}
            className={cn(
              "flex min-h-[300px] flex-col gap-2.5 rounded-xl border-2 border-dashed p-2.5 transition-colors",
              dragOverCol === status ? "border-primary bg-info-bg/30" : "border-transparent bg-subtle"
            )}
          >
            <div className="flex items-center justify-between px-1">
              <span className={cn("text-[12.5px] font-bold", tone)}>{label}</span>
              <span className="text-[11px] text-muted-foreground">{items.length}개</span>
            </div>

            {items.length === 0 && (
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed py-8 text-[11.5px] text-muted-foreground">
                여기로 드래그해서 이동
              </div>
            )}

            {items.map((c) => {
              const status = c.reviewStatus;
              const dupRisk = isDuplicateRisk(c, latestYear);
              return (
                <Card
                  key={c.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/company-id", String(c.id))}
                  onClick={() => onOpenDetail(c.id)}
                  className="cursor-pointer space-y-2.5 p-3 active:opacity-70"
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      disabled={!selectedIds.has(c.id) && selectedIds.size >= MAX_COMPARE}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => onToggleSelect(c.id)}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-bold">{c.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{c.industry ?? "업종 미상"}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {dupRisk && <AlertTriangle className="h-3.5 w-3.5 text-bad" />}
                      <ScoreBadge score={resolveOverallScore(c, groupWeights, weights, techWeights)} size="sm" />
                    </div>
                  </div>

                  <p className="text-[11px] tabular-nums text-muted-foreground">{formatKRW(c.revenueLatest)}</p>

                  <AxisMiniBars scores={c.scores} />

                  <div className="flex items-center justify-between pt-0.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDetail(c.id);
                      }}
                      className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                    >
                      <Eye className="h-3 w-3" /> 상세보기
                    </button>
                    <StatusDropdown status={status} onChange={(next) => onSetStatus(c.id, next)} />
                  </div>
                </Card>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

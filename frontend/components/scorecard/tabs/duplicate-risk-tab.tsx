import { AlertTriangle, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatKRW } from "@/lib/utils";
import type { Company } from "@/types";
import { DUPLICATE_RISK_THRESHOLD, recentSelectionCount, recordYear, riskLevel, RISK_LEVEL_BADGE, selectionsByYear } from "@/lib/duplicate-risk";

export function DuplicateRiskTab({ company, latestYear }: { company: Company; latestYear: number }) {
  const count = recentSelectionCount(company, latestYear);
  const level = riskLevel(count);
  const byYear = selectionsByYear(company, latestYear);
  const from = latestYear - byYear.length + 1;
  const recentSelections = company.supportHistory.filter(
    (h) => h.result === "선정" && recordYear(h) >= from && recordYear(h) <= latestYear
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-bold">
          최근 {byYear.length}개년 중복 분석 <span className="font-normal text-muted-foreground">({from}~{latestYear})</span>
        </p>
        <Badge variant={RISK_LEVEL_BADGE[level]} className="text-[12px]">
          중복 위험도: {level}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {byYear.map(({ year, count }) => (
          <div key={year} className="rounded-lg bg-subtle py-4 text-center">
            <p className="text-[12px] text-muted-foreground">{year}년</p>
            <p className="mt-1 text-[22px] font-extrabold tabular-nums">{count}</p>
            <p className="text-[11px] text-muted-foreground">선정</p>
          </div>
        ))}
      </div>

      <div>
        <p className="mb-2 text-[12.5px] font-bold">
          {byYear.length}년간 선정 합계: <span className="text-primary">{count}건</span>
        </p>
        {recentSelections.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">해당 기간 선정 내역이 없습니다.</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {recentSelections.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-3.5 py-2.5 text-[12.5px]">
                <div className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 shrink-0 text-good" />
                  <span className="tabular-nums text-muted-foreground">{r.date}</span>
                  <span>{r.bizType}</span>
                </div>
                {r.amount > 0 && <span className="tabular-nums text-[11px] text-muted-foreground">{formatKRW(r.amount)}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {count >= DUPLICATE_RISK_THRESHOLD && (
        <div className="flex items-start gap-2 rounded-lg bg-warn-bg px-3.5 py-3 text-[12px] text-[hsl(30_75%_38%)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            최근 {byYear.length}년 내 {count}회 선정됨. 중복수혜 가이드라인 검토 필요.
          </p>
        </div>
      )}
    </div>
  );
}

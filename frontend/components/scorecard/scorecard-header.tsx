"use client";

import { Badge } from "@/components/ui/badge";
import { formatKRW } from "@/lib/utils";
import { AlertTriangle, MapPin } from "lucide-react";
import type { Company } from "@/types";

function daysSinceLatestSelection(company: Company): number | null {
  const sel = company.supportHistory.filter((r) => r.result === "선정").map((r) => r.date).sort().at(-1);
  if (!sel) return null;
  const diff = Date.now() - new Date(sel).getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

export function ScorecardHeader({ company }: { company: Company }) {
  const elapsed = daysSinceLatestSelection(company);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-xl font-bold">{company.name}</h1>
        <Badge variant="outline">#{company.id}</Badge>
        {!company.dataQuality.ok && (
          <Badge variant="warn">
            <AlertTriangle className="mr-1 h-3 w-3" />
            일부 재무지표 결측 {company.dataQuality.missing.length}건
          </Badge>
        )}
        {company.passthrough.자본잠식_플래그 === 1 && <Badge variant="bad">자본잠식</Badge>}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <span>{company.industry ?? "업종 미상"} <span className="text-xs">({company.industryCode})</span></span>
        <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{company.region ?? "-"}</span>
        <span>매출 {formatKRW(company.revenueLatest)}</span>
        <span>누적 지원금 {formatKRW(company.support.총지원금_천원)} ({company.support.건수 ?? 0}건)</span>
        <span>마지막 선정 {elapsed == null ? "-" : `${elapsed}일 전`}</span>
      </div>
    </div>
  );
}

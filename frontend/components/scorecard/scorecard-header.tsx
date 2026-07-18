"use client";

import { AlertTriangle, Clock, Maximize2, MapPin, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/ui/score-badge";
import { StatusStack } from "@/components/scorecard/status-buttons";
import { computeOverallScore, axisSpread, AXIS_MISALIGNMENT_THRESHOLD, DEFAULT_AXIS_WEIGHTS } from "@/lib/scoring";
import { useReviewStatus } from "@/lib/app-state";
import { isDuplicateRisk, recentSelectionCount, DUPLICATE_RISK_WINDOW_YEARS } from "@/lib/duplicate-risk";
import type { Axis, Company } from "@/types";

export function ScorecardHeader({
  company,
  latestYear,
  weights = DEFAULT_AXIS_WEIGHTS,
  onClose,
  onExpand,
}: {
  company: Company;
  latestYear: number;
  weights?: Record<Axis, number>;
  onClose?: () => void;
  onExpand?: () => void;
}) {
  const { statuses, setStatus } = useReviewStatus();
  const status = statuses[company.id] ?? company.reviewStatus;
  const dupRisk = isDuplicateRisk(company, latestYear);
  const recentCount = recentSelectionCount(company, latestYear);
  const misaligned = axisSpread(company.scores) >= AXIS_MISALIGNMENT_THRESHOLD;

  return (
    <div className="space-y-3">
      {dupRisk && (
        <div className="inline-flex items-center gap-1.5 rounded-full bg-orangeTone-bg px-2.5 py-1 text-[11px] font-medium text-orangeTone">
          <Clock className="h-3 w-3" />
          최근 {DUPLICATE_RISK_WINDOW_YEARS}년 {recentCount}회 수혜
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[18px] font-extrabold tracking-tight">{company.name}</h2>
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {company.industry ?? "업종 미상"} {company.industryCode && `· ${company.industryCode}`}
            {company.region && (
              <>
                {" · "}
                <MapPin className="mb-0.5 inline h-3 w-3" /> {company.region}
              </>
            )}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {!company.dataQuality.ok && (
              <Badge variant="warn">
                <AlertTriangle className="mr-1 h-3 w-3" />
                데이터 이슈 {company.dataQuality.missing.length}건
              </Badge>
            )}
            {company.passthrough.자본잠식_플래그 === 1 && (
              <Badge variant="bad">
                <AlertTriangle className="mr-1 h-3 w-3" />
                자본잠식
              </Badge>
            )}
            {misaligned && (
              <Badge variant="warn">
                <AlertTriangle className="mr-1 h-3 w-3" />
                축 어긋남 — 겹쳐읽기 필요
              </Badge>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-start gap-2">
          <ScoreBadge score={computeOverallScore(company.scores, weights)} size="lg" />
          <StatusStack status={status} onChange={(next) => setStatus(company.id, next)} />
          {(onExpand || onClose) && (
            <div className="flex flex-col gap-1">
              {onExpand && (
                <button onClick={onExpand} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              )}
              {onClose && (
                <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

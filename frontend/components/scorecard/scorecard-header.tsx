"use client";

import { AlertTriangle, Clock, Maximize2, MapPin, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/ui/score-badge";
import { StatusStack } from "@/components/scorecard/status-buttons";
import { computeOverallScore, axisSpread, AXIS_MISALIGNMENT_THRESHOLD, DEFAULT_AXIS_WEIGHTS } from "@/lib/scoring";
import { useReviewStatus } from "@/lib/app-state";
import { isDuplicateRisk, recentSelectionCount, DUPLICATE_RISK_WINDOW_YEARS } from "@/lib/duplicate-risk";
import { DuplicateFlagBadge } from "@/components/axis9/DuplicateFlagBadge";
import { AXES, type Axis, type Company } from "@/types";

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
  // 경고 박스에 "왜"를 수치로 보여주기 위한 최고·최저 축 (null 축은 비교에서 제외)
  const hiAxis = AXES.reduce((a, b) => ((company.scores[b] ?? -1) > (company.scores[a] ?? -1) ? b : a));
  const loAxis = AXES.reduce((a, b) => ((company.scores[b] ?? 101) < (company.scores[a] ?? 101) ? b : a));

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {dupRisk && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-orangeTone-bg px-2.5 py-1 text-[11px] font-medium text-orangeTone">
              <Clock className="h-3 w-3" />
              최근 {DUPLICATE_RISK_WINDOW_YEARS}년 {recentCount}회 수혜
            </div>
          )}
          <DuplicateFlagBadge flag={company.duplicateFlag} />
        </div>
        {(onExpand || onClose) && (
          <div className="flex shrink-0 items-center gap-1">
            {onExpand && (
              <button onClick={onExpand} aria-label="전체 화면으로 열기" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            )}
            {onClose && (
              <button onClick={onClose} aria-label="닫기" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

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
          </div>
        </div>

        <div className="flex shrink-0 items-start gap-2">
          {/* 이 점수는 재무 4축 가중평균이다(기술력·정합성 미포함). 라벨 없이 두면
              '종합점수'로 오인되므로 범위를 명시한다 — scoring.ts 주석 참고. */}
          <div className="flex flex-col items-center gap-1">
            <ScoreBadge score={computeOverallScore(company.scores, weights)} size="lg" />
            <span className="text-[10px] leading-none text-muted-foreground" title="성장성·수익성·효율성·안정성 가중평균. 기술력·정합성은 별도 확인">
              재무 4축
            </span>
            {company.tech?.scores.rndPatent != null && (
              <span className="text-[10px] leading-none text-muted-foreground">
                R&D {Math.round(company.tech.scores.rndPatent)}
              </span>
            )}
          </div>
          <StatusStack status={status} onChange={(next) => setStatus(company.id, next)} />
        </div>
      </div>

      {misaligned && (
        <div className="flex items-start gap-2 rounded-lg bg-warn-bg px-3 py-2.5 text-[hsl(30_75%_38%)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="text-[12.5px] font-bold">축별 점수 차이 큼 — 종합점수 주의</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed opacity-90">
              {hiAxis} {Math.round(company.scores[hiAxis] ?? 0)} ↔ {loAxis} {Math.round(company.scores[loAxis] ?? 0)} ·
              종합점수만 보면 오판할 수 있어요. 4축 점수를 각각 확인하세요.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

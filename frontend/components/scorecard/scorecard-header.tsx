"use client";

import { useState } from "react";
import { AlertTriangle, Maximize2, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/ui/score-badge";
import { StatusStack } from "@/components/scorecard/status-buttons";
import { resolveOverallScore, DEFAULT_AXIS_WEIGHTS, DEFAULT_GROUP_WEIGHTS, DEFAULT_TECH_WEIGHTS, isCustomWeights, type TechAxis } from "@/lib/scoring";
import { useReviewStatus } from "@/lib/app-state";
import { isDuplicateRisk, recentSelectionCount, DUPLICATE_RISK_WINDOW_YEARS } from "@/lib/duplicate-risk";
import { deriveRiskGrade } from "@/lib/review-summary";
import { formatKRW, cn } from "@/lib/utils";
import { DuplicateFlagBadge } from "@/components/axis9/DuplicateFlagBadge";
import { DecisionReasonModal } from "@/components/scorecard/decision-reason-modal";
import { type Axis, type Company, type CompositeGroup } from "@/types";

export function ScorecardHeader({
  company,
  latestYear,
  programKey,
  weights = DEFAULT_AXIS_WEIGHTS,
  groupWeights = DEFAULT_GROUP_WEIGHTS,
  techWeights = DEFAULT_TECH_WEIGHTS,
  onClose,
  onExpand,
}: {
  company: Company;
  latestYear: number;
  programKey?: string | null; // 현재 심사 중인 사업 — 없으면(직접 진입) 상태 변경 비활성
  weights?: Record<Axis, number>;
  groupWeights?: Record<CompositeGroup, number>;
  techWeights?: Record<TechAxis, number>;
  onClose?: () => void;
  onExpand?: () => void;
}) {
  const { statusOf, setStatus, reasonOf } = useReviewStatus();
  const status = statusOf(company.id, programKey);
  const reason = reasonOf(company.id, programKey);
  // 선정/제외를 고르면 사유 모달을 띄운다(후보=미결정은 바로 반영). 사업 없이는 상태 변경 불가.
  const [pending, setPending] = useState<"선정" | "제외" | null>(null);
  function onDecision(next: typeof status) {
    if (!programKey) return;
    if (next === "선정" || next === "제외") setPending(next);
    else setStatus(company.id, programKey, next); // 후보로 되돌리기
  }
  const dupRisk = isDuplicateRisk(company, latestYear);
  const recentCount = recentSelectionCount(company, latestYear);
  const overall = resolveOverallScore(company, groupWeights, weights, techWeights);
  const custom = isCustomWeights(groupWeights, weights, techWeights);
  // 커스텀 가중치면 프론트 재계산 결과의 lowestAxis를, 아니면 서버 compositeScore를 그대로 근거로 삼는다.
  const cs = company.compositeScore;
  const lowestAxis = cs?.lowestAxis ?? null;
  const lowestAxisScore = cs?.lowestAxisScore ?? null;
  // 캡이 실제로 발동했는지(가중평균 - 캡후 종합점수 차이가 있으면 축 어긋남이 점수를 끌어내렸다는 뜻)
  const capActive = cs?.rawWeightedAverage != null && cs.score != null && cs.rawWeightedAverage - cs.score > 0.5;

  // 건전성 등급 + 기업 기본 상태(설립·업력·자본금) — CRETOP식 "살아있는·검증된 기업인가"
  const risk = deriveRiskGrade(company, latestYear);
  const foundedYear = company.foundedDate ? Number(company.foundedDate.slice(0, 4)) : null;
  const ageYears = foundedYear ? latestYear - foundedYear : null;
  const basicInfo = [
    foundedYear ? `설립 ${foundedYear}${ageYears != null && ageYears >= 0 ? ` · 업력 ${ageYears}년` : ""}` : null,
    company.capitalThousand != null ? `자본금 ${formatKRW(company.capitalThousand)}` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {/* 건전성 등급 — 흩어진 위험 신호의 롤업. 근거는 title/아래 심사요약에 병기 */}
          <span
            title={risk.reasons.length ? `근거: ${risk.reasons.join(", ")}` : "위험 신호 없음"}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold",
              risk.tone === "good" ? "bg-good-bg text-good"
                : risk.tone === "warn" ? "bg-warn-bg text-[hsl(30_75%_38%)]"
                : risk.tone === "bad" ? "bg-bad-bg text-bad"
                : "bg-muted text-muted-foreground"
            )}
          >
            {risk.tone === "good" ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
            건전성 {risk.grade}
          </span>
          {dupRisk && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-orangeTone-bg px-2.5 py-1 text-[11px] font-medium text-orangeTone">
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
          </p>
          {basicInfo.length > 0 && (
            <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
              {basicInfo.join(" · ")}
              {company.companyStatus && !company.isClosed && <span className="text-good"> · {company.companyStatus}</span>}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {company.isClosed && (
              <Badge variant="bad">
                <AlertTriangle className="mr-1 h-3 w-3" />
                {company.closureType ?? "휴·폐업"}
              </Badge>
            )}
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
          {/* 종합점수 = 재무4축+기술2축+정합성, 최저축 캡 적용(docs/종합점수_설계노트.md).
              축별 breakdown이 진짜 판단 근거이므로 이 배지 단독으로 판단하지 않도록 아래
              경고 박스와 각 탭의 축별 점수를 항상 함께 노출한다. */}
          <div className="flex flex-col items-center">
            <ScoreBadge
              score={overall}
              size="xl"
              title={`종합점수${custom ? " (커스텀)" : ""} — 재무4축·기술2축·정합성 가중평균(최저축 캡 적용). 축별 점수는 아래 탭에서 확인`}
            />
          </div>
          <StatusStack status={status} disabled={!programKey} onChange={onDecision} />
        </div>
      </div>

      {capActive && lowestAxis && lowestAxisScore != null && cs && (
        <div className="flex items-start gap-2 rounded-lg bg-warn-bg px-3 py-2.5 text-[hsl(30_75%_38%)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="text-[12.5px] font-bold">축 어긋남 — {lowestAxis} 저점이 종합점수를 끌어내림</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed opacity-90">
              가중평균 {Math.round(cs.rawWeightedAverage ?? 0)}점이었다면 {lowestAxis} {Math.round(lowestAxisScore)}점 때문에
              {" "}{Math.round(cs.score ?? 0)}점으로 조정됐어요. 축별 점수를 각각 확인하세요.
            </p>
          </div>
        </div>
      )}

      {/* 심사 결정 사유 — 선정/제외 시 남긴 근거. 클릭하면 다시 수정 */}
      {(status === "선정" || status === "제외") && reason && (
        <button
          type="button"
          onClick={() => setPending(status)}
          className="flex w-full items-start gap-1.5 rounded-lg border px-3 py-2 text-left text-[11.5px] hover:bg-muted/50"
        >
          <span className={cn("shrink-0 font-bold", status === "선정" ? "text-good" : "text-bad")}>{status} 사유</span>
          <span className="min-w-0 flex-1 text-muted-foreground">{reason}</span>
        </button>
      )}

      {pending && programKey && (
        <DecisionReasonModal
          company={company.name}
          decision={pending}
          initialReason={reason}
          onClose={() => setPending(null)}
          onConfirm={(r) => {
            setStatus(company.id, programKey, pending, r);
            setPending(null);
          }}
        />
      )}
    </div>
  );
}

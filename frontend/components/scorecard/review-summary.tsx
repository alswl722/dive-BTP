"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  deriveAxisVerdicts,
  deriveReviewSignals,
  type AxisKey,
  type Severity,
} from "@/lib/review-summary";
import type { Company } from "@/types";

const SEV_CHIP: Record<Severity, string> = {
  위험: "bg-bad text-white",
  주의: "bg-warn text-white",
  정보: "bg-muted text-muted-foreground",
};

const TONE_DOT: Record<string, string> = {
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
  muted: "bg-muted-foreground/40",
};

/**
 * 심사 요약 — 6개 탭에 흩어진 신호를 축별 한 줄 결론으로 모은다.
 *
 * 담당자가 탭을 다 열지 않아도 어느 축에 문제가 있는지 훑고, 눌러서 바로 그 탭으로
 * 이동할 수 있게 한다. 신호 상세(근거 문구·연도별 표 등)는 여기 모아두지 않고 각
 * 축 탭 상단(AxisSignals)에 둔다 — 개요 화면이 색 배너로 뒤덮이는 걸 피하고, 신호가
 * 관련 데이터 바로 옆 맥락에서 보이게 하기 위함.
 */
export function ReviewSummary({
  company,
  latestYear,
  onJumpTab,
}: {
  company: Company;
  latestYear: number;
  onJumpTab?: (tab: AxisKey) => void;
}) {
  const signals = deriveReviewSignals(company, latestYear);
  const verdicts = deriveAxisVerdicts(company, latestYear);
  const counts = signals.reduce((acc, s) => {
    acc[s.sev] = (acc[s.sev] ?? 0) + 1;
    return acc;
  }, {} as Record<Severity, number>);

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-bold">심사 요약</p>
        <div className="flex items-center gap-1.5">
          {(["위험", "주의", "정보"] as const).map((sev) =>
            counts[sev] ? (
              <span
                key={sev}
                className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-bold", SEV_CHIP[sev])}
              >
                {sev} {counts[sev]}
              </span>
            ) : null
          )}
          {signals.length === 0 && (
            <span className="rounded-full bg-good-bg px-2 py-0.5 text-[10.5px] font-bold text-good">
              특이사항 없음
            </span>
          )}
        </div>
      </div>

      {/* 축별 한 줄 결론 — 신호 상세는 각 탭 상단에서 확인 */}
      <div className="divide-y rounded-lg border">
        {verdicts.map((v) => (
          <button
            key={v.axis}
            type="button"
            onClick={() => onJumpTab?.(v.axis)}
            disabled={!onJumpTab}
            className={cn(
              "flex w-full items-center gap-2.5 px-3 py-2 text-left",
              onJumpTab && "transition-colors hover:bg-muted/50"
            )}
          >
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TONE_DOT[v.tone])} />
            <span className="w-[68px] shrink-0 text-[11.5px] text-muted-foreground">{v.axis}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium">{v.headline}</span>
              {v.detail && (
                <span className="block truncate text-[11px] text-muted-foreground">{v.detail}</span>
              )}
            </span>
            {onJumpTab && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          </button>
        ))}
      </div>
    </div>
  );
}

"use client";

import { AlertTriangle, ChevronRight, Info, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  deriveAxisVerdicts,
  deriveReviewSignals,
  type AxisKey,
  type Severity,
} from "@/lib/review-summary";
import type { Company } from "@/types";

const SEV_STYLE: Record<Severity, { wrap: string; chip: string; icon: typeof AlertTriangle }> = {
  위험: { wrap: "bg-bad-bg", chip: "bg-bad text-white", icon: ShieldAlert },
  주의: { wrap: "bg-warn-bg", chip: "bg-warn text-white", icon: AlertTriangle },
  정보: { wrap: "bg-muted/40", chip: "bg-muted text-muted-foreground", icon: Info },
};

const TONE_DOT: Record<string, string> = {
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
  muted: "bg-muted-foreground/40",
};

/**
 * 심사 요약 — 6개 탭에 흩어진 신호를 한 화면에 모은다.
 *
 * 담당자가 탭을 다 열지 않아도 (1) 축별 결론 (2) 심각도순 경고를 볼 수 있게 하고,
 * 각 항목에서 해당 탭으로 바로 이동시킨다. 판단은 대신하지 않고 근거만 제시한다.
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
                className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-bold", SEV_STYLE[sev].chip)}
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

      {/* 축별 한 줄 결론 */}
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

      {/* 통합 위험 신호 — 심각도순 */}
      {signals.length > 0 && (
        <div className="space-y-1.5">
          {signals.map((s, i) => {
            const style = SEV_STYLE[s.sev];
            const Icon = style.icon;
            return (
              <button
                key={`${s.axis}-${s.title}-${i}`}
                type="button"
                onClick={() => onJumpTab?.(s.axis)}
                disabled={!onJumpTab}
                className={cn(
                  "flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left",
                  style.wrap,
                  onJumpTab && "transition-opacity hover:opacity-80"
                )}
              >
                <Icon
                  className={cn(
                    "mt-0.5 h-3.5 w-3.5 shrink-0",
                    s.sev === "위험" ? "text-bad" : s.sev === "주의" ? "text-[hsl(30_75%_38%)]" : "text-muted-foreground"
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[12px] font-bold">{s.title}</span>
                    <span className="text-[10.5px] text-muted-foreground">{s.axis}</span>
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted-foreground">
                    {s.detail}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Info, ShieldAlert } from "lucide-react";
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
        <div className="space-y-1">
          {signals.map((s, i) => {
            if (s.kind === "employment") {
              return (
                <EmploymentSignal
                  key={`${s.axis}-${s.title}-${i}`}
                  company={company}
                  sev={s.sev}
                  title={s.title}
                  detail={s.detail}
                />
              );
            }
            if (s.kind === "lifeline") {
              return (
                <LifelineSignal
                  key={`${s.axis}-${s.title}-${i}`}
                  company={company}
                  sev={s.sev}
                  title={s.title}
                  detail={s.detail}
                />
              );
            }
            const style = SEV_STYLE[s.sev];
            const Icon = style.icon;
            return (
              <button
                key={`${s.axis}-${s.title}-${i}`}
                type="button"
                onClick={() => onJumpTab?.(s.axis)}
                disabled={!onJumpTab}
                title={s.detail}
                className={cn(
                  "flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left",
                  style.wrap,
                  onJumpTab && "transition-opacity hover:opacity-80"
                )}
              >
                <Icon
                  className={cn(
                    "mt-[3px] h-3.5 w-3.5 shrink-0",
                    s.sev === "위험" ? "text-bad" : s.sev === "주의" ? "text-[hsl(30_75%_38%)]" : "text-muted-foreground"
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[12px] font-bold leading-tight">{s.title}</span>
                    <span className="text-[10.5px] text-muted-foreground">{s.axis}</span>
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground line-clamp-1">
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

/**
 * 고용 회전율 신호 — 다른 배지와 달리 포지션 바(항상)와 연도별 펼침표를 붙인다.
 * "가입자수만 보면 성장 같지만 실제 대량 입·퇴사"를 심사자가 근거까지 확인하게 한다.
 */
function EmploymentSignal({
  company,
  sev,
  title,
  detail,
}: {
  company: Company;
  sev: Severity;
  title: string;
  detail: string;
}) {
  const [open, setOpen] = useState(false);
  const emp = company.employment;
  const pctl = emp?.회전율백분위 ?? null;
  const basis = company.percentileBasis === "업종내" ? "업종" : "전체";
  const series = emp?.series ?? null;
  const Icon = SEV_STYLE[sev].icon;

  return (
    <div className={cn("rounded-lg px-2.5 py-2", SEV_STYLE[sev].wrap)}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(30_75%_38%)]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-bold">{title}</span>
            <span className="text-[10.5px] text-muted-foreground">재무</span>
            {pctl != null && <PositionBar percentile={pctl} basisLabel={basis} />}
          </div>
          <p className="mt-0.5 text-pretty break-keep text-[11.5px] leading-relaxed text-muted-foreground">{detail}</p>

          {series && series.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="mt-1.5 flex items-center gap-0.5 text-[11px] font-medium text-info transition-opacity hover:opacity-80"
              >
                연도별 보기
                <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
              </button>
              {open && <EmploymentTable series={series} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** 회전율 백분위 미니 포지션 바 — 제목 줄 우측에 작게. 중앙값 대비 위치, 높을수록 불안정. */
function PositionBar({ percentile, basisLabel }: { percentile: number; basisLabel: string }) {
  const pos = Math.max(0, Math.min(100, percentile));
  const top = Math.max(1, Math.round(100 - pos)); // 회전율 상위 몇 %(=불안정 정도)
  return (
    <span
      className="ml-auto flex shrink-0 items-center gap-1.5"
      title={`회전율 ${basisLabel} 분포 · 중앙값 대비 위치(높을수록 불안정)`}
    >
      <span className="text-[10px] font-semibold text-bad">{basisLabel} 상위 {top}%</span>
      <span className="relative h-1.5 w-14 rounded-full bg-gradient-to-r from-good/25 via-warn/30 to-bad/45">
        <span className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-muted-foreground/50" style={{ left: "50%" }} />
        <span
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-bad shadow"
          style={{ left: `${pos}%` }}
        />
      </span>
    </span>
  );
}

/**
 * 영업외 연명 신호 — 클릭하면 연도별 영업이익 vs 당기순이익 표를 펼친다.
 * "본업 적자인데 최종 흑자"(=영업외로 연명)가 어느 해였는지 심사자가 직접 확인한다.
 */
function LifelineSignal({
  company,
  sev,
  title,
  detail,
}: {
  company: Company;
  sev: Severity;
  title: string;
  detail: string;
}) {
  const [open, setOpen] = useState(false);
  const series = company.nonopIncome?.series ?? null;
  const Icon = SEV_STYLE[sev].icon;

  return (
    <div className={cn("rounded-lg px-2.5 py-2", SEV_STYLE[sev].wrap)}>
      <div className="flex items-start gap-2">
        <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", sev === "위험" ? "text-bad" : "text-[hsl(30_75%_38%)]")} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-bold">{title}</span>
            <span className="text-[10.5px] text-muted-foreground">재무</span>
          </div>
          <p className="mt-0.5 text-pretty break-keep text-[11.5px] leading-relaxed text-muted-foreground">{detail}</p>

          {series && series.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="mt-1.5 flex items-center gap-0.5 text-[11px] font-medium text-info transition-opacity hover:opacity-80"
              >
                연도별 보기
                <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
              </button>
              {open && <NonopTable series={series} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** 천원 → "±N.N억" (1억 = 100,000천원). 부호 유지, 소수 1자리. */
function toEok(v: number | null): string {
  if (v == null) return "—";
  const eok = v / 100_000;
  return `${eok >= 0 ? "" : "-"}${Math.abs(eok).toFixed(1)}억`;
}

/** 연도별 영업이익 vs 당기순이익. 본업<0·최종≥0(영업외로 연명)인 해를 강조. */
function NonopTable({
  series,
}: {
  series: NonNullable<NonNullable<Company["nonopIncome"]>["series"]>;
}) {
  return (
    <div className="mt-2 overflow-hidden rounded-md border bg-card/60">
      <table className="w-full text-[10.5px] tabular-nums">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="px-2 py-1 text-left font-medium">연도</th>
            <th className="px-2 py-1 text-right font-medium">영업이익</th>
            <th className="px-2 py-1 text-right font-medium">당기순이익</th>
            <th className="px-2 py-1 text-right font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {series.map((r) => {
            const lifeline = r.영업이익 != null && r.당기순이익 != null && r.영업이익 < 0 && r.당기순이익 >= 0;
            return (
              <tr key={r.year} className={cn("border-b last:border-0", lifeline && "bg-bad/5")}>
                <td className="px-2 py-1 text-left text-muted-foreground">{r.year}</td>
                <td className={cn("px-2 py-1 text-right", r.영업이익 != null && r.영업이익 < 0 && "text-bad")}>{toEok(r.영업이익)}</td>
                <td className="px-2 py-1 text-right">{toEok(r.당기순이익)}</td>
                <td className="px-2 py-1 text-right text-[9.5px] font-medium text-bad">{lifeline ? "연명" : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 연도별 국민연금 가입/취업/퇴직 + 연도별 이직률. 만성 vs 일회성을 심사자가 직접 판단. */
function EmploymentTable({
  series,
}: {
  series: NonNullable<NonNullable<Company["employment"]>["series"]>;
}) {
  return (
    <div className="mt-2 overflow-hidden rounded-md border bg-card/60">
      <table className="w-full text-[10.5px] tabular-nums">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="px-2 py-1 text-left font-medium">연도</th>
            <th className="px-2 py-1 text-right font-medium">가입</th>
            <th className="px-2 py-1 text-right font-medium">취업</th>
            <th className="px-2 py-1 text-right font-medium">퇴직</th>
            <th className="px-2 py-1 text-right font-medium">이직률</th>
          </tr>
        </thead>
        <tbody>
          {series.map((r) => {
            const churn =
              r.가입 && r.가입 > 0 && r.퇴직 != null ? Math.round((r.퇴직 / r.가입) * 100) : null;
            return (
              <tr key={r.year} className="border-b last:border-0">
                <td className="px-2 py-1 text-left text-muted-foreground">{r.year}</td>
                <td className="px-2 py-1 text-right">{r.가입 ?? "—"}</td>
                <td className="px-2 py-1 text-right">{r.취업 ?? "—"}</td>
                <td className="px-2 py-1 text-right">{r.퇴직 ?? "—"}</td>
                <td className={cn("px-2 py-1 text-right font-semibold", churn != null && churn >= 50 && "text-bad")}>
                  {churn != null ? `${churn}%` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

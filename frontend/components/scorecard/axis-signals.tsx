"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, Info, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Selectable } from "@/lib/report-select";
import { deriveReviewSignals, type AxisKey, type Severity } from "@/lib/review-summary";
import type { Company } from "@/types";

const SEV_STYLE: Record<Severity, { wrap: string; icon: typeof AlertTriangle }> = {
  위험: { wrap: "bg-bad-bg", icon: ShieldAlert },
  주의: { wrap: "bg-warn-bg", icon: AlertTriangle },
  정보: { wrap: "bg-muted/40", icon: Info },
};

/**
 * 해당 축 탭 상단에 이 축의 위험·주의·정보 신호를 보여준다. 심사 요약(개요)엔 축별
 * 한 줄 결론만 남기고, 신호 상세는 관련 데이터 바로 옆인 각 탭으로 옮겼다 —
 * 개요 화면이 색 배너로 뒤덮이는 문제를 없애면서 신호 근거는 맥락 안에서 바로 보게 한다.
 */
export function AxisSignals({ company, latestYear, axis }: { company: Company; latestYear: number; axis: AxisKey }) {
  const signals = deriveReviewSignals(company, latestYear).filter((s) => s.axis === axis);
  if (signals.length === 0) return null;

  // Selectable을 호출부가 아니라 여기(널 가드 뒤)에 두는 이유 — 신호가 없으면 이 컴포넌트가
  // null을 반환하는데, 밖에서 감싸면 선택모드에서 빈 체크박스 상자만 남는다.
  return (
    <Selectable id={`sig-${axis}`}>
      <div className="space-y-1.5">
        {signals.map((s, i) => {
          if (s.kind === "employment") {
            return <EmploymentSignal key={`${s.title}-${i}`} company={company} sev={s.sev} title={s.title} detail={s.detail} />;
          }
          if (s.kind === "lifeline") {
            return <LifelineSignal key={`${s.title}-${i}`} company={company} sev={s.sev} title={s.title} detail={s.detail} />;
          }
          const style = SEV_STYLE[s.sev];
          const Icon = style.icon;
          return (
            <div key={`${s.title}-${i}`} className={cn("flex items-start gap-2 rounded-lg px-2.5 py-1.5", style.wrap)}>
              <Icon
                className={cn(
                  "mt-[3px] h-3.5 w-3.5 shrink-0",
                  s.sev === "위험" ? "text-bad" : s.sev === "주의" ? "text-[hsl(30_75%_38%)]" : "text-muted-foreground"
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-bold leading-tight">{s.title}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{s.detail}</span>
              </span>
            </div>
          );
        })}
      </div>
    </Selectable>
  );
}

/**
 * 고용 회전율 신호 — 다른 배지와 달리 포지션 바(항상)를 붙인다.
 * "연도별 상세"는 고용 탭의 "국민연금 연도별 상세"와 중복이라 제거 (2026-07 고용 탭 신설 시 이관).
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
  const emp = company.employment;
  const pctl = emp?.회전율백분위 ?? null;
  const basis = company.percentileBasis === "업종내" ? "업종" : "전체";
  const Icon = SEV_STYLE[sev].icon;

  return (
    <div className={cn("rounded-lg px-2.5 py-2", SEV_STYLE[sev].wrap)}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(30_75%_38%)]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-bold">{title}</span>
            {pctl != null && <PositionBar percentile={pctl} basisLabel={basis} />}
          </div>
          <p className="mt-0.5 text-pretty break-keep text-[11.5px] leading-relaxed text-muted-foreground">{detail}</p>
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
          <span className="text-[12px] font-bold">{title}</span>
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

// EmploymentTable(연도별 국민연금 표)는 고용 탭의 "국민연금 연도별 상세" 로 이관됨(2026-07).
// 개요 배지에서는 포지션 바만 노출해 중복 표기 방지.

"use client";

// 고용축 상세 탭.
//
// 스코어링 미포함(SCORE_COLS 불변) · 재무 4축 왜곡 없음. docs/고용회전율_영업외손익_설계노트.md
// 결정 유지. 여기선 담당자가 심사할 때 실측으로 확인할 4개 축을 시각화한다:
//   1) 규모·변화 — 채용/감원 실적 (지원사업 KPI 심사 핵심)
//   2) 처우      — 서류상 우수 고용 주장을 급여 수준으로 감사
//   3) 생산성    — 인력 대비 매출·영업이익 (자본 효율)
//   4) 안정성    — 국민연금 3종 기반 이직·회전 (기존 배지 재활용)

import { useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";
import { AlertTriangle, ChevronDown, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { AxisSignals } from "@/components/scorecard/axis-signals";
import { cn, formatKRW } from "@/lib/utils";
import type { Company } from "@/types";

// ----- 포맷 헬퍼 ---------------------------------------------------------

/** 원 단위 급여를 "N,NNN만" 표기. 1,000만 이상은 억 단위. */
function formatSalaryWon(won: number | null | undefined): string {
  if (won == null) return "—";
  if (Math.abs(won) >= 1e8) return `${(won / 1e8).toFixed(2)}억`;
  if (Math.abs(won) >= 1e4) return `${Math.round(won / 1e4).toLocaleString()}만`;
  return `${Math.round(won).toLocaleString()}원`;
}

/** decimal(0.15) → "+15.0%" 서명 포함. */
function formatPct(v: number | null | undefined, digits = 1): string {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(digits)}%`;
}

/** 백분위(0~100) → "업종·규모 상위 N%" 등. basis 는 실제로 사용된 tier(업종x규모/업종내/전체).
 *  샘플이 작아 fallback 되면 자동으로 "전체" 로 표기해 오독 방지.
 *  P50 미만은 하위 표기. */
function rankText(pct: number | null | undefined, basis: string | null | undefined): string | null {
  if (pct == null) return null;
  const p = Math.round(pct);
  const scope =
    basis === "업종x규모" ? "업종·규모"
    : basis === "업종내" ? "업종"
    : "전체";
  if (p >= 50) return `${scope} 상위 ${100 - p}%`;
  return `${scope} 하위 ${p}%`;
}

/** 5년 증감(명) → "+N명" 서명 포함. */
function formatDelta(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${Math.round(n).toLocaleString()}명`;
}

/** 이직률(decimal) → "N.N%" (서명 없음, 회전율 · 비율 지표). */
function formatRate(v: number | null | undefined, digits = 1): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

// ----- 메인 --------------------------------------------------------------

export function EmploymentTab({ company, latestYear }: { company: Company; latestYear: number }) {
  const e = company.employment;
  const p = company.passthrough;

  if (!e && (p.이직률_최근 == null && p.고용회전율_최근 == null)) {
    return (
      <div className="rounded-lg bg-subtle p-6 text-center text-[13px] text-muted-foreground">
        고용 데이터 없음 — 이 기업은 종업원수·국민연금·급여 원본이 모두 결측입니다.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <AxisSignals company={company} latestYear={latestYear} axis="고용" />

      {/* 1. 인력 규모 · 변화 — 지원사업 심사에서 '고용창출' KPI 핵심 */}
      <ScaleSection company={company} />

      {/* 2. 처우 — 서류상 우수 고용 주장을 실측 급여로 감사 */}
      <SalarySection company={company} />

      {/* 3. 인력 생산성 — 성장·수익축과 독립적으로 자본 효율 진단 */}
      <ProductivitySection company={company} />

      {/* 4. 인력 안정성 — 국민연금 3종 기반 이직·회전 */}
      <StabilitySection company={company} />
    </div>
  );
}

// ----- 섹션 --------------------------------------------------------------

/** 1. 인력 규모 · 변화 — 종업원수 4카드 + 5년 스파크라인 */
function ScaleSection({ company }: { company: Company }) {
  const e = company.employment;
  const basis = company.percentileBasis;
  const empCount = e?.종업원수_최근 ?? null;
  const cagr = e?.종업원수_CAGR ?? null;
  const delta5y = e?.종업원수_증감_5년 ?? null;
  const empPct = e?.종업원수증가_백분위 ?? null;

  // 스파크라인 데이터 — scaleSeries에서 종업원수만 뽑기
  const scaleData = (e?.scaleSeries ?? [])
    .map((r) => ({ year: r.year, value: r.종업원수 }))
    .filter((r) => r.value != null) as { year: number; value: number }[];

  return (
    <section className="space-y-2">
      <SectionLabel>인력 규모 · 변화</SectionLabel>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="종업원수 (최근)"
          value={empCount != null ? `${Math.round(empCount).toLocaleString()}명` : "—"}
          sub={rankText(empPct, basis) ?? undefined}
        />
        <StatCard
          label="5년 CAGR"
          value={formatPct(cagr)}
          sub={cagr != null ? (cagr > 0 ? "인력 성장" : cagr < 0 ? "인력 감소" : "정체") : undefined}
        />
        <StatCard
          label="5년 증감"
          value={formatDelta(delta5y)}
          sub={delta5y != null && delta5y > 0 ? "순채용" : delta5y != null && delta5y < 0 ? "순감원" : undefined}
        />
        <StatCard
          label="최근 이직률"
          value={formatRate(company.passthrough.이직률_최근)}
          sub={
            e?.회전율백분위 != null
              ? rankText(e.회전율백분위, basis) ?? "—"
              : "국민연금 데이터 없음"
          }
        />
      </div>

      {scaleData.length >= 2 && (
        <div className="rounded-lg border bg-card p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11.5px] font-medium text-muted-foreground">종업원수 추이</span>
            <span className="text-[10.5px] text-muted-foreground">
              {scaleData[0].year} → {scaleData[scaleData.length - 1].year}
            </span>
          </div>
          <TrendChart data={scaleData} format={(v) => `${Math.round(v)}명`} allowNegative={false} />
        </div>
      )}
    </section>
  );
}

/** 2. 처우 — 3카드 + 급여 5년 스파크라인 */
function SalarySection({ company }: { company: Company }) {
  const e = company.employment;
  const basis = company.percentileBasis;
  const salLatest = e?.급여_최근_원 ?? null;
  const salCagr = e?.급여_CAGR ?? null;
  const salPct = e?.급여_백분위 ?? null;

  const salData = (e?.scaleSeries ?? [])
    .map((r) => ({ year: r.year, value: r.급여_원 }))
    .filter((r) => r.value != null) as { year: number; value: number }[];

  const basisLabel =
    basis === "업종x규모" ? "업종·규모 대비"
    : basis === "업종내" ? "업종 대비"
    : "전체 대비";

  return (
    <section className="space-y-2">
      <SectionLabel>처우 · 급여 수준</SectionLabel>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          label="1인당 평균급여 (최근)"
          value={formatSalaryWon(salLatest)}
          sub={rankText(salPct, basis) ?? undefined}
        />
        <StatCard
          label="5년 급여 CAGR"
          value={formatPct(salCagr)}
          sub={salCagr != null ? (salCagr > 0.03 ? "처우 개선" : salCagr < 0 ? "실질 삭감" : "정체") : undefined}
        />
        <StatCard
          label={basisLabel}
          value={salPct != null ? `${Math.round(salPct)}%` : "—"}
          sub={
            salPct != null
              ? salPct >= 75
                ? "상위 25%"
                : salPct >= 50
                  ? "상위 절반"
                  : "하위 절반"
              : undefined
          }
        />
      </div>

      {salData.length >= 2 && (
        <div className="rounded-lg border bg-card p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11.5px] font-medium text-muted-foreground">평균급여 추이</span>
            <span className="text-[10.5px] text-muted-foreground">
              {salData[0].year} → {salData[salData.length - 1].year}
            </span>
          </div>
          <TrendChart data={salData} format={(v) => formatSalaryWon(v)} allowNegative={false} />
        </div>
      )}
    </section>
  );
}

/** 3. 인력 생산성 — 인당 매출·영업이익 */
function ProductivitySection({ company }: { company: Company }) {
  const e = company.employment;
  const basis = company.percentileBasis;
  const revPerEmp = e?.인당매출_최근_천원 ?? null;
  const opPerEmp = e?.인당영업이익_최근_천원 ?? null;
  const revPct = e?.인당매출_백분위 ?? null;

  const opNegative = opPerEmp != null && opPerEmp < 0;

  return (
    <section className="space-y-2">
      <SectionLabel>인력 생산성</SectionLabel>
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="인당 매출"
          value={formatKRW(revPerEmp)}
          sub={rankText(revPct, basis) ?? "자본 효율 지표"}
        />
        <StatCard
          label="인당 영업이익"
          value={formatKRW(opPerEmp)}
          sub={opNegative ? "인력 대비 본업 적자" : "본업 생산성"}
        />
      </div>
    </section>
  );
}

/** 4. 인력 안정성 — 국민연금 3종 (접힘형) + 회전율 배지 */
function StabilitySection({ company }: { company: Company }) {
  const e = company.employment;
  const p = company.passthrough;
  const [open, setOpen] = useState(false);

  const hasNP = (e?.series ?? []).length > 0;
  const turnover = p.고용회전율_최근;

  return (
    <section className="space-y-2">
      <SectionLabel>인력 안정성 · 국민연금 3종</SectionLabel>

      {turnover != null && (
        <div className="flex items-center gap-2 rounded-lg border p-3 text-[12.5px]">
          <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">
            고용 회전율(가입 대비 취업+퇴직):{" "}
            <span className="font-medium text-foreground">{formatRate(turnover)}</span>
            {e?.회전율백분위 != null && (
              <>
                {" · "}
                <span className="font-medium text-foreground">
                  {rankText(e.회전율백분위, company.percentileBasis)}
                </span>
              </>
            )}
          </p>
        </div>
      )}

      {!hasNP && (
        <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2.5 text-[11.5px] text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>국민연금 3종(가입/취업/퇴직) 원본 없음 — 회전율·이직률 판정 불가.</span>
        </div>
      )}

      {hasNP && (
        <div className="rounded-lg border">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex w-full items-center justify-between px-3.5 py-2.5 text-[12.5px] font-medium hover:bg-muted/40"
          >
            <span>국민연금 연도별 상세 ({(e?.series ?? []).length}개년)</span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
          </button>
          {open && (
            <div className="border-t px-3.5 py-3">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="pb-1.5 text-left font-normal">연도</th>
                    <th className="pb-1.5 text-right font-normal">가입</th>
                    <th className="pb-1.5 text-right font-normal">취업</th>
                    <th className="pb-1.5 text-right font-normal">퇴직</th>
                    <th className="pb-1.5 text-right font-normal">이직률</th>
                  </tr>
                </thead>
                <tbody>
                  {(e?.series ?? []).map((r) => {
                    const rate = r.가입 != null && r.가입 > 0 && r.퇴직 != null ? r.퇴직 / r.가입 : null;
                    return (
                      <tr key={r.year} className="border-t">
                        <td className="py-1.5 tabular-nums">{r.year}</td>
                        <td className="py-1.5 text-right tabular-nums">{r.가입 != null ? Math.round(r.가입) : "—"}</td>
                        <td className="py-1.5 text-right tabular-nums">{r.취업 != null ? Math.round(r.취업) : "—"}</td>
                        <td className="py-1.5 text-right tabular-nums">{r.퇴직 != null ? Math.round(r.퇴직) : "—"}</td>
                        <td className="py-1.5 text-right tabular-nums">{formatRate(rate)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ----- 공통 부품 ---------------------------------------------------------

/** 재무 탭 SectionLabel 과 동일 톤 (다른 탭과 시각 언어 통일). */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{children}</p>;
}

/** 5년 스파크라인 — finance-scorecard의 AreaChart 패턴 축약 (지원사업 도트 제외). */
function TrendChart({
  data,
  format,
  allowNegative,
}: {
  data: { year: number; value: number }[];
  format: (v: number) => string;
  allowNegative: boolean;
}) {
  const gradId = "employmentAreaGrad";
  const color = "hsl(var(--primary))";
  return (
    <div className="h-16 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, bottom: 4, left: 4, right: 4 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="year" hide />
          <YAxis hide domain={["dataMin", "dataMax"]} />
          {allowNegative && <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />}
          <Tooltip
            content={(rawProps) => {
              const props = rawProps as { active?: boolean; label?: number; payload?: Array<{ value: number | null }> };
              if (!props.active || !props.payload || props.payload.length === 0) return null;
              const v = props.payload[0]?.value;
              if (v == null) return null;
              return (
                <div className="rounded border bg-card px-2 py-1 text-[11px] shadow-sm">
                  <div className="tabular-nums text-muted-foreground">{props.label}</div>
                  <div className="font-medium">{format(v)}</div>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradId})`}
            baseValue="dataMin"
            dot={false}
            activeDot={{ r: 3.5, fill: color, stroke: "hsl(var(--card))", strokeWidth: 1.5 }}
            isAnimationActive={false}
            connectNulls
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

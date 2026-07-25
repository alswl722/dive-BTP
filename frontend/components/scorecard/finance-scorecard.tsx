"use client";

import { useState } from "react";
import { AlertTriangle, ArrowDown, ChevronDown } from "lucide-react";
import { Area, AreaChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { AxisRadar } from "@/components/charts/axis-radar";
import { cn, formatKRW } from "@/lib/utils";
import { scoreBand, SCORE_BAND_BADGE } from "@/lib/scoring";
import { AXES, type Axis, type Company, type SupportRecord, type TrendPoint } from "@/types";

// 축별 세부지표(백분위 드릴다운) — backend scoring_finance.py의 SCORE_COLS와 동일한 매핑.
export const AXIS_METRICS: Record<Axis, string[]> = {
  성장성: ["매출_CAGR", "매출_성장안정성", "매출_성장가속도", "자산_CAGR", "자산_성장안정성", "자산_성장가속도"],
  수익성: ["영업이익률_최근", "순이익률_최근", "매출총이익률_최근", "ROA", "ROE", "판관비율", "흑자지속성", "수익성추세", "ROA추세", "ROE추세"],
  효율성: ["총자산회전율"],
  안정성: ["부채비율_최근", "자기자본비율", "자본잠식정도", "이익잉여금축적", "부채비율추세"],
};

// 백분위는 방향 보정이 끝난 값이지만, 드릴다운의 "원값"은 방향 라벨이 없으면 오독한다.
const LOWER_IS_BETTER = new Set(["부채비율_최근", "판관비율", "부채비율추세"]);
// 원값이 비율(소수)이라 ×100 % 표기가 필요한 지표.
const PERCENT_METRICS = new Set([
  "매출_CAGR", "자산_CAGR", "영업이익률_최근", "순이익률_최근", "매출총이익률_최근",
  "ROA", "ROE", "판관비율", "자기자본비율", "부채비율_최근",
]);

function isNum(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

const band = scoreBand;

/** 점수 숫자 톤(60/40) — band와 별도로 큰 숫자의 색만 결정. */
function scoreTone(score: number | null | undefined): string {
  if (!isNum(score)) return "text-muted-foreground";
  if (score >= 60) return "text-good";
  if (score >= 40) return "text-[hsl(30_75%_38%)]";
  return "text-bad";
}

const toneBar: Record<string, string> = { good: "bg-good", warn: "bg-warn", bad: "bg-bad", muted: "bg-muted-foreground/40" };
const toneBadge = SCORE_BAND_BADGE;

function metricLabel(key: string) {
  return key.replace("_최근", "").replace(/_/g, " ");
}

/** 백분위(0~100, 100=최상위) → "상위/하위 N%" 자연어. P50 이상은 상위, 미만은 하위. 극단값은 최소 1%로 표기. */
function percentileLabel(pct: number): string {
  const p = Math.round(pct);
  return p >= 50 ? `상위 ${Math.max(1, 100 - p)}%` : `하위 ${Math.max(1, p)}%`;
}

function formatRaw(key: string, value: number | null | undefined): string {
  if (!isNum(value)) return "—";
  if (key.includes("회전율")) return `${value.toFixed(2)}회`;
  if (PERCENT_METRICS.has(key)) return `${(value * 100).toFixed(1)}%`;
  if (key === "흑자지속성") return `${Math.round(value)}년/5년`;
  if (Math.abs(value) >= 1000) return value.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
  return value.toFixed(2);
}

/* ------------------------------------------------------------------ */
/* 위험 게이트 — 결격 신호는 점수에 섞지 않고 카드 최상단에서 분리 표시  */
/* ------------------------------------------------------------------ */

function fireRiskRules(company: Company): string[] {
  const rules: string[] = [];
  const debt = company.rawMetrics["부채비율_최근"];
  const stab = company.scores.안정성;

  if (company.passthrough.자본잠식_플래그 === 1) {
    rules.push("자본잠식 — 자본총계 0 이하. 최우선 결격 검토 대상");
  }
  if (isNum(stab) && stab < 25 && isNum(debt) && debt > 2) {
    rules.push(`부채비율 ${Math.round(debt * 100).toLocaleString("ko-KR")}% — 자기자본 대비 부채 과다 (안정성 ${Math.round(stab)})`);
  }
  // 자본총계 급감: 플래그(완전잠식)가 0이어도 궤적상 잠식 임박이면 잡는다.
  const cap = (company.trends.자본총계 ?? []).filter((d) => isNum(d.value)) as { year: number; value: number }[];
  if (cap.length >= 2) {
    const max = Math.max(...cap.map((d) => d.value));
    const last = cap[cap.length - 1].value;
    if (max > 0 && last < 0.3 * max) {
      rules.push(`자본총계 ${formatKRW(cap[0].value)} → ${formatKRW(last)} 급감 — 완전잠식 임박`);
    }
  }
  return rules;
}

function RiskGate({ rules }: { rules: string[] }) {
  if (rules.length === 0) return null;
  return (
    <div className="rounded-xl bg-bad-bg p-4">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-bad" aria-hidden />
        <div className="min-w-0">
          <p className="text-[13.5px] font-bold text-bad">재무 위험 신호 — 결격 검토 필요</p>
          <ul className="mt-1.5 space-y-1">
            {rules.map((r) => (
              <li key={r} className="flex gap-1.5 text-[12.5px] leading-snug text-bad">
                <span aria-hidden>·</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 스파크라인 + 지원 시점 도트/툴팁                                     */
/* ------------------------------------------------------------------ */

type SupportsByYear = Record<number, SupportRecord[]>;

/** 선정 이력만 연도별 그룹핑 — 추세 위 도트/툴팁의 데이터 소스. */
function groupSupportsByYear(supports: SupportRecord[]): SupportsByYear {
  const out: SupportsByYear = {};
  for (const s of supports) {
    if (s.result !== "선정") continue;
    const y = s.year ?? Number(s.date.slice(0, 4));
    if (!Number.isFinite(y)) continue;
    (out[y] ??= []).push(s);
  }
  return out;
}

function SupportTooltip({
  active,
  label,
  payload,
  supportsByYear,
  formatValue,
}: {
  active?: boolean;
  label?: number;
  payload?: Array<{ value: number | null }>;
  supportsByYear: SupportsByYear;
  formatValue: (v: number) => string;
}) {
  if (!active || label == null) return null;
  const v = payload?.[0]?.value;
  const supports = supportsByYear[label] ?? [];
  const total = supports.reduce((sum, s) => sum + (s.amount || 0), 0);
  return (
    <div className="min-w-[170px] rounded-lg border bg-card p-2.5 text-[12px] shadow-card">
      <p className="font-bold">
        {label}년{isNum(v) && <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">{formatValue(v)}</span>}
      </p>
      {supports.length > 0 && (
        <div className="mt-1.5 border-t pt-1.5">
          <p className="mb-1 text-[11px] font-bold text-good">지원 {supports.length}건 · 총 {formatKRW(total)}</p>
          <ul className="space-y-0.5">
            {supports.slice(0, 6).map((s, i) => (
              <li key={i} className="truncate text-[10.5px] text-muted-foreground">
                · {s.bizType}
                {s.amount > 0 && <span className="ml-1 tabular-nums">({formatKRW(s.amount)})</span>}
              </li>
            ))}
            {supports.length > 6 && <li className="text-[10.5px] text-muted-foreground">… 외 {supports.length - 6}건</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

function Sparkline({
  data,
  colorVar,
  allowNegative,
  supportsByYear,
  formatValue,
}: {
  data: TrendPoint[];
  colorVar: string; // ex) "var(--axis-growth)"
  allowNegative: boolean;
  supportsByYear: SupportsByYear;
  formatValue: (v: number) => string;
}) {
  const points = data.filter((d) => isNum(d.value));
  if (points.length < 2) {
    return <div className="flex h-16 items-center text-[10px] text-muted-foreground">추세 데이터 부족</div>;
  }
  // 지원받은 연도 중 추세값이 있는 지점 → 도트 좌표
  const dots = data.filter((d) => isNum(d.value) && supportsByYear[d.year]) as { year: number; value: number }[];
  const color = `hsl(${colorVar})`;
  // 같은 id를 써도 각 차트가 독립 <svg>라 스코프가 겹치지 않는다(전 축 동일 브랜드 블루).
  const gradId = "financeAreaGrad";
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
          {/* XAxis 없으면 ReferenceDot(x=연도) 좌표 매칭이 안 됨 — hide로 숨기고 스케일만 제공 */}
          <XAxis dataKey="year" hide />
          <YAxis hide domain={["dataMin", "dataMax"]} />
          {allowNegative && <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />}
          <Tooltip
            content={(props) => (
              <SupportTooltip
                {...(props as { active?: boolean; label?: number; payload?: Array<{ value: number | null }> })}
                supportsByYear={supportsByYear}
                formatValue={formatValue}
              />
            )}
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
          {dots.map((d) => (
            <ReferenceDot
              key={d.year}
              x={d.year}
              y={d.value}
              r={4}
              fill="hsl(var(--good))"
              stroke="hsl(var(--card))"
              strokeWidth={1.5}
              isFront
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 축 타일                                                             */
/* ------------------------------------------------------------------ */

// 색은 대표색(브랜드 블루 --primary)으로 통일 — 4축 그래프를 한 톤의 그라데이션 영역 차트로 본다.
const TREND_FOR_AXIS: Partial<Record<Axis, { key: string; colorVar: string; allowNegative: boolean; format: (v: number) => string }>> = {
  성장성: { key: "매출액", colorVar: "var(--primary)", allowNegative: false, format: (v) => formatKRW(v) },
  수익성: { key: "영업이익률", colorVar: "var(--primary)", allowNegative: true, format: (v) => `${v.toFixed(1)}%` },
  안정성: { key: "자본총계", colorVar: "var(--primary)", allowNegative: true, format: (v) => formatKRW(v) },
};

function AxisTile({ company, axis, supportsByYear }: { company: Company; axis: Axis; supportsByYear: SupportsByYear }) {
  const score = company.scores[axis];
  const metricCount = AXIS_METRICS[axis].length;
  const singleMetric = metricCount === 1;
  const b = band(score);
  const trend = TREND_FOR_AXIS[axis];
  const trendData = trend ? company.trends[trend.key] : undefined;

  return (
    <div className={cn("flex flex-col gap-2 rounded-lg bg-subtle p-3.5", singleMetric && "opacity-60")}>
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] font-bold">{axis}</span>
        {singleMetric ? (
          <Badge variant="warn" className="px-2 py-0.5 text-[10px]">단일지표 · 참고</Badge>
        ) : (
          <Badge variant={toneBadge[b.tone]} className="px-2 py-0.5 text-[10px]">{b.label}</Badge>
        )}
      </div>

      <div className="flex items-end gap-2">
        <span className={cn("text-[32px] font-extrabold leading-none tracking-tight tabular-nums", scoreTone(score))}>
          {isNum(score) ? Math.round(score) : "—"}
        </span>
      </div>

      {trend && trendData ? (
        <Sparkline
          data={trendData}
          colorVar={trend.colorVar}
          allowNegative={trend.allowNegative}
          supportsByYear={supportsByYear}
          formatValue={trend.format}
        />
      ) : (
        <div className="flex h-16 items-center text-[12px] font-medium">
          총자산회전율 {formatRaw("총자산회전율", company.rawMetrics["총자산회전율"])}
          <span className="ml-1.5 text-[10.5px] text-muted-foreground">· 자산 급감 시 착시 주의</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 축별 세부지표 드릴다운                                               */
/* ------------------------------------------------------------------ */

function MetricRow({ company, metricKey }: { company: Company; metricKey: string }) {
  const pct = company.percentiles[metricKey];
  const raw = company.rawMetrics[metricKey];
  const b = band(pct);
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <span className="truncate text-[12.5px] font-medium">{metricLabel(metricKey)}</span>
          {/* 원본값이 거꾸로 읽히는 지표만 ↓ 표시 — 나머지(높을수록 좋음)는 당연하므로 안내문 생략 */}
          {LOWER_IS_BETTER.has(metricKey) && (
            <ArrowDown className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="낮을수록 좋음" />
          )}
        </div>
        {/* 트랙 가운데 눈금 = P50(중간) 기준선 — 색 막대에 의미를 준다 */}
        <div className="relative mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          {isNum(pct) && (
            <div className={cn("h-full rounded-full", toneBar[b.tone])} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
          )}
          <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-foreground/25" aria-hidden />
        </div>
      </div>
      <div className="text-right">
        <div className="text-[12.5px] font-bold tabular-nums">{formatRaw(metricKey, raw)}</div>
        <div className="text-[10px] tabular-nums text-muted-foreground">{isNum(pct) ? percentileLabel(pct) : "—"}</div>
      </div>
    </div>
  );
}

function DrillDownRow({ company, axis, open, onToggle }: { company: Company; axis: Axis; open: boolean; onToggle: () => void }) {
  const score = company.scores[axis];
  const b = band(score);
  return (
    <div className="border-b last:border-b-0">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between gap-3 py-2.5 text-left">
        <span className="flex items-center gap-2">
          <span className="text-[12.5px] font-bold">{axis}</span>
          <Badge variant={toneBadge[b.tone]} className="px-2 py-0.5 text-[10px]">{b.label}</Badge>
          <span className="text-[10.5px] text-muted-foreground">{AXIS_METRICS[axis].length}개 지표</span>
        </span>
        <span className="flex items-center gap-2">
          <span className={cn("text-[13px] font-bold tabular-nums", scoreTone(score))}>{isNum(score) ? Math.round(score) : "—"}</span>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
        </span>
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 pb-3 pt-1 sm:grid-cols-2">
          {AXIS_METRICS[axis].map((m) => (
            <MetricRow key={m} company={company} metricKey={m} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 메인                                                                */
/* ------------------------------------------------------------------ */

export function FinanceScorecard({ company }: { company: Company }) {
  // 기본으로 열어둘 축 = 최저점 축 (심사자가 제일 먼저 확인할 곳)
  const lowestAxis = AXES.reduce<Axis | null>((acc, axis) => {
    const s = company.scores[axis];
    if (!isNum(s)) return acc;
    if (acc === null) return axis;
    const prev = company.scores[acc];
    return isNum(prev) && prev <= s ? acc : axis;
  }, null);

  const [openAxis, setOpenAxis] = useState<Axis | null>(lowestAxis);
  const riskRules = fireRiskRules(company);
  const supportsByYear = groupSupportsByYear(company.supportHistory);

  return (
    <div className="space-y-5">
      <RiskGate rules={riskRules} />

      <div>
        <p className="mb-2.5 text-[12.5px] font-bold">업종 평균 대비</p>
        <AxisRadar scores={company.scores} />
      </div>

      <div>
        <p className="mb-2 text-[12.5px] font-bold">재무 4축</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {AXES.map((axis) => (
            <AxisTile key={axis} company={company} axis={axis} supportsByYear={supportsByYear} />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-[12.5px] font-bold">축별 세부지표 <span className="font-normal text-muted-foreground">· 서류 검증용 원값</span></p>
        <div className="rounded-lg bg-subtle px-3.5">
          {AXES.map((axis) => (
            <DrillDownRow key={axis} company={company} axis={axis} open={openAxis === axis} onToggle={() => setOpenAxis((cur) => (cur === axis ? null : axis))} />
          ))}
        </div>
      </div>
    </div>
  );
}

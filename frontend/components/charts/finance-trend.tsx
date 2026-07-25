"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrendPoint } from "@/types";
import { formatKRW } from "@/lib/utils";

/** 재무 3종 시계열. 자산·매출은 규모가 커 좌축, 영업이익은 상대적으로 작고 음수도
 *  가능해 우축으로 분리한다(한 축에 얹으면 영업이익이 0 근처로 눌려 안 읽힘). */
type Series = { key: string; label: string; color: string; axis: "left" | "right" };

const SERIES: Series[] = [
  { key: "자산총계", label: "자산", color: "hsl(var(--primary))", axis: "left" },
  { key: "매출액", label: "매출액", color: "hsl(150 55% 48%)", axis: "left" },
  { key: "영업이익", label: "영업이익", color: "hsl(35 92% 52%)", axis: "right" },
];

const compact = (v: number) => formatKRW(v); // 천원 단위 → 억/만원 축약

export function FinanceTrendChart({ trends }: { trends: Record<string, TrendPoint[]> }) {
  const years = Array.from(
    new Set(SERIES.flatMap((s) => (trends[s.key] ?? []).map((p) => p.year)))
  ).sort((a, b) => a - b);

  const data = years.map((year) => {
    const row: Record<string, number | null> = { year };
    for (const s of SERIES) {
      row[s.key] = (trends[s.key] ?? []).find((p) => p.year === year)?.value ?? null;
    }
    return row;
  });

  const hasData = data.some((r) => SERIES.some((s) => r[s.key] != null));
  if (!hasData) {
    return <p className="py-6 text-center text-[12px] text-muted-foreground">재무 추세 데이터 없음</p>;
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={190}>
        <LineChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -6 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 11 }} stroke="hsl(206 15% 60%)" tickLine={false} />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 10 }}
            stroke="hsl(206 15% 60%)"
            tickLine={false}
            width={52}
            tickFormatter={compact}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 10 }}
            stroke="hsl(35 60% 55%)"
            tickLine={false}
            width={52}
            tickFormatter={compact}
          />
          <Tooltip
            content={(props) => {
              const p = props as { active?: boolean; label?: number; payload?: Array<{ dataKey: string; value: number | null }> };
              if (!p.active || p.label == null) return null;
              return (
                <div className="min-w-[150px] rounded-lg border bg-card p-2.5 text-[12px] shadow-card">
                  <p className="mb-1 font-bold">{p.label}년</p>
                  <ul className="space-y-0.5">
                    {SERIES.map((s) => {
                      const v = p.payload?.find((row) => row.dataKey === s.key)?.value;
                      return (
                        <li key={s.key} className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                            {s.label}
                          </span>
                          <span className="tabular-nums font-medium">{v == null ? "—" : formatKRW(v)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            }}
          />
          {SERIES.map((s) => (
            <Line
              key={s.key}
              yAxisId={s.axis}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 3, fill: "hsl(var(--card))", stroke: s.color, strokeWidth: 1.5 }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* 범례 — 영업이익은 축이 달라 명시 */}
      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px]">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label}
            {s.axis === "right" && <span className="text-[10px] opacity-70">(우축)</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

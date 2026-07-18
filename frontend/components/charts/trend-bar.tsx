"use client";

import { Bar, BarChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import type { TrendPoint, SupportRecord } from "@/types";
import { formatKRW } from "@/lib/utils";

/** 5개년 재무 추세 막대(스코어카드 재무 탭 — 개요 탭의 TrendLine과 구분).
 *
 *  supports prop이 있으면 지원받은 연도의 막대 위에 녹색 점을 표시하고,
 *  hover 시 툴팁에 그 연도 지원 내역을 나열한다.
 */
export function TrendBar({
  data,
  color = "hsl(200 99% 37%)",
  supports = [],
}: {
  data: TrendPoint[];
  color?: string;
  supports?: SupportRecord[];
}) {
  const clean = data.filter((d) => d.value != null);
  if (clean.length < 2) {
    return <div className="py-6 text-center text-xs text-muted-foreground">추세 데이터 부족</div>;
  }

  // 선정된 지원만 연도별 그룹핑
  const supportsByYear: Record<number, SupportRecord[]> = {};
  for (const s of supports) {
    if (s.result !== "선정") continue;
    const y = s.year ?? Number(s.date.slice(0, 4));
    if (!Number.isFinite(y)) continue;
    (supportsByYear[y] ??= []).push(s);
  }

  // 지원받은 연도만 추출 → ReferenceDot으로 정확한 좌표(x=연도, y=값)에 원을 렌더
  const supportedPoints = data
    .filter((d) => d.value != null && supportsByYear[d.year])
    .map((d) => ({ year: d.year, value: d.value as number }));

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: -18 }}>
        <XAxis dataKey="year" tick={{ fontSize: 11 }} stroke="hsl(206 15% 60%)" />
        <YAxis
          tick={{ fontSize: 10 }}
          stroke="hsl(206 15% 60%)"
          width={44}
          tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)}
        />
        <Tooltip
          content={(props) => <SupportTooltip {...(props as never)} supportsByYear={supportsByYear} />}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.value == null ? "hsl(206 20% 88%)" : color} />
          ))}
        </Bar>
        {/* 지원받은 연도의 막대 상단(양수)·하단(음수) 정확 좌표에 원 표시. 절반은 막대와 겹침, 절반은 바깥으로. */}
        {supportedPoints.map((p) => (
          <ReferenceDot
            key={p.year}
            x={p.year}
            y={p.value}
            r={6}
            fill="hsl(140 60% 40%)"
            stroke="white"
            strokeWidth={2}
            isFront={true}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function SupportTooltip({
  active,
  label,
  payload,
  supportsByYear,
}: {
  active?: boolean;
  label?: number;
  payload?: Array<{ dataKey: string; value: number | null }>;
  supportsByYear: Record<number, SupportRecord[]>;
}) {
  if (!active || label == null) return null;
  const barPoint = payload?.find((p) => p.dataKey === "value");
  const barValue = barPoint?.value;
  const supports = supportsByYear[label] ?? [];
  const totalAmount = supports.reduce((sum, s) => sum + (s.amount || 0), 0);

  return (
    <div className="rounded-lg border bg-white p-2.5 shadow-md text-[12px] min-w-[180px]">
      <p className="font-bold">{label}년</p>
      {barValue != null && (
        <p className="text-muted-foreground mt-0.5">
          값: <span className="tabular-nums">{barValue.toLocaleString?.() ?? barValue}</span>
        </p>
      )}
      {supports.length > 0 && (
        <div className="mt-2 border-t pt-2">
          <p className="text-[11px] font-bold text-[hsl(140_60%_30%)] mb-1">
            🟢 지원 {supports.length}건 · 총 {formatKRW(totalAmount)}
          </p>
          <ul className="space-y-0.5">
            {supports.slice(0, 6).map((s, i) => (
              <li key={i} className="text-[10.5px] text-muted-foreground truncate">
                · {s.bizType}
                {s.amount > 0 && (
                  <span className="tabular-nums ml-1">({formatKRW(s.amount)})</span>
                )}
              </li>
            ))}
            {supports.length > 6 && (
              <li className="text-[10.5px] text-muted-foreground">... 외 {supports.length - 6}건</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

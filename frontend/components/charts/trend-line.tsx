"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrendPoint } from "@/types";

/** 5개년 재무 추세 라인 (스코어카드 드릴다운). */
export function TrendLine({ data, color = "hsl(222 47% 45%)" }: { data: TrendPoint[]; color?: string }) {
  const clean = data.filter((d) => d.value != null);
  if (clean.length < 2) return <div className="py-6 text-center text-xs text-muted-foreground">추세 데이터 부족</div>;
  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <XAxis dataKey="year" tick={{ fontSize: 11 }} stroke="hsl(215 16% 60%)" />
        <YAxis tick={{ fontSize: 10 }} stroke="hsl(215 16% 60%)" width={44} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(214 20% 88%)" }}
          formatter={(v: number) => v?.toLocaleString?.() ?? v}
        />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

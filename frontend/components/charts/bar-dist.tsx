"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** 가로 막대(연도추이·지역분포 등). */
export function BarDist({
  data,
  xKey,
  yKey,
  height = 200,
  color = "#4f86c6",
}: {
  data: Record<string, string | number>[];
  xKey: string;
  yKey: string;
  height?: number;
  color?: string;
}) {
  if (!data.length) return <div className="py-6 text-center text-xs text-muted-foreground">데이터 없음</div>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <XAxis dataKey={xKey} tick={{ fontSize: 11 }} stroke="hsl(215 16% 60%)" />
        <YAxis tick={{ fontSize: 10 }} stroke="hsl(215 16% 60%)" allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} cursor={{ fill: "hsl(210 16% 93%)" }} />
        <Bar dataKey={yKey} fill={color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

"use client";

import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { AXES, type AxisScores } from "@/types";

/** 축별 점수 다이아몬드(레이더) — 업종 평균(50) 대비 형태 파악용. */
export function AxisRadar({ scores }: { scores: AxisScores }) {
  const data = AXES.map((axis) => ({ axis, value: scores[axis] ?? 0 }));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="hsl(206 20% 88%)" />
        <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: "hsl(206 15% 49%)" }} />
        <Radar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.18} strokeWidth={2} isAnimationActive={false} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

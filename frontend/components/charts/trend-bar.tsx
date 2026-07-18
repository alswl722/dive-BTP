"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import type { TrendPoint } from "@/types";

/** 5개년 재무 추세 막대(스코어카드 재무 탭 — 개요 탭의 TrendLine과 구분). */
export function TrendBar({ data, color = "hsl(200 99% 37%)" }: { data: TrendPoint[]; color?: string }) {
  const clean = data.filter((d) => d.value != null);
  if (clean.length < 2) return <div className="py-6 text-center text-xs text-muted-foreground">추세 데이터 부족</div>;
  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <XAxis dataKey="year" tick={{ fontSize: 11 }} stroke="hsl(206 15% 60%)" />
        <YAxis tick={{ fontSize: 10 }} stroke="hsl(206 15% 60%)" width={44} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(206 20% 88%)" }}
          formatter={(v: number) => v?.toLocaleString?.() ?? v}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.value == null ? "hsl(206 20% 88%)" : color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

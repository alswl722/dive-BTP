"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = ["#3b5b92", "#4f86c6", "#6fb1e0", "#9ecae1", "#f0a848", "#e07a5f", "#81b29a"];

/** 사업유형 분포 등 카테고리 도넛. */
export function DonutDist({ data, height = 180 }: { data: { name: string; value: number }[]; height?: number }) {
  if (!data.length) return <div className="py-6 text-center text-xs text-muted-foreground">데이터 없음</div>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2} isAnimationActive={false}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

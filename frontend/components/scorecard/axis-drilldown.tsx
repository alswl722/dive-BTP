"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { ScoreBar } from "@/components/ui/score-bar";
import { TrendLine } from "@/components/charts/trend-line";
import { AXES, AXIS_METRICS, type Axis, type Company } from "@/types";

// 축 → 대표 추세 컬럼 (있을 때만 표시)
const AXIS_TREND: Partial<Record<Axis, { key: string; label: string }>> = {
  성장성: { key: "매출액", label: "매출액 추세 (천원)" },
  수익성: { key: "영업이익률", label: "영업이익률 추세 (%)" },
  안정성: { key: "부채총계", label: "부채총계 추세 (천원)" },
};

export function AxisDrilldown({ company }: { company: Company }) {
  const [axis, setAxis] = useState<Axis>("수익성");
  const metrics = AXIS_METRICS[axis];
  const trend = AXIS_TREND[axis];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>축 상세 — 지표별 업종 백분위</CardTitle>
        <Tabs tabs={[...AXES]} active={axis} onChange={(t) => setAxis(t as Axis)} />
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-2">
        <div className="space-y-3">
          {metrics.map((m) => (
            <ScoreBar key={m} label={m} value={company.percentiles[m] ?? null} />
          ))}
        </div>
        <div>
          {trend ? (
            <>
              <p className="mb-1 text-xs text-muted-foreground">{trend.label}</p>
              <TrendLine data={company.trends[trend.key] ?? []} />
            </>
          ) : (
            <p className="py-6 text-center text-xs text-muted-foreground">이 축은 추세 그래프 없음</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

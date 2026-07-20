"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { AXES, COMPOSITE_GROUPS, type Axis, type CompositeGroup } from "@/types";
import { cn } from "@/lib/utils";
import { DEFAULT_AXIS_WEIGHTS, DEFAULT_GROUP_WEIGHTS, isCustomWeights } from "@/lib/scoring";

const AXIS_BAR_COLOR: Record<Axis, string> = {
  성장성: "bg-axis-growth",
  수익성: "bg-axis-profit",
  효율성: "bg-axis-efficiency",
  안정성: "bg-axis-stability",
};

const GROUP_LABEL: Record<CompositeGroup, string> = {
  finance: "재무",
  tech: "기술",
  alignment: "정합성",
};

const GROUP_BAR_COLOR: Record<CompositeGroup, string> = {
  finance: "bg-axis-growth",
  tech: "bg-axis-profit",
  alignment: "bg-axis-stability",
};

function rebalance<K extends string>(weights: Record<K, number>, keys: readonly K[], key: K, rawValue: number): Record<K, number> {
  const value = Math.max(0, Math.min(100, rawValue));
  const others = keys.filter((k) => k !== key);
  const otherSum = others.reduce((s, k) => s + weights[k], 0);
  const remaining = 100 - value;
  const next: Record<K, number> = { ...weights, [key]: value };
  if (otherSum <= 0) {
    others.forEach((k) => { next[k] = remaining / others.length; });
  } else {
    others.forEach((k) => { next[k] = (weights[k] * remaining) / otherSum; });
  }
  return next;
}

export function WeightPopover({
  weights,
  onChange,
  groupWeights,
  onGroupChange,
}: {
  weights: Record<Axis, number>;
  onChange: (w: Record<Axis, number>) => void;
  groupWeights: Record<CompositeGroup, number>;
  onGroupChange: (w: Record<CompositeGroup, number>) => void;
}) {
  const [open, setOpen] = useState(false);
  const axisTotal = Math.round(AXES.reduce((s, a) => s + weights[a], 0));
  const groupTotal = Math.round(COMPOSITE_GROUPS.reduce((s, g) => s + groupWeights[g], 0));
  const isCustom = isCustomWeights(groupWeights, weights);

  function resetAll() {
    onChange(DEFAULT_AXIS_WEIGHTS);
    onGroupChange(DEFAULT_GROUP_WEIGHTS);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12.5px] font-medium",
          isCustom ? "border-primary text-primary" : "text-foreground hover:bg-muted"
        )}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        축 가중치 조정
        {isCustom && <Badge />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-2 w-[340px] space-y-5 rounded-xl bg-card p-4 shadow-modal">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-bold">종합점수 가중치 조정</p>
              <button onClick={resetAll} className="text-[11.5px] text-primary hover:underline">
                전체 초기화
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              그룹 비율(재무/기술/정합성)과 재무 세부축 비율을 각각 조정할 수 있습니다. 최저축 캡(최저축+15점)은
              가중치를 바꿔도 항상 적용되어 축 어긋남이 가려지지 않습니다.
            </p>

            {/* 그룹(재무/기술/정합성) */}
            <div className="space-y-2">
              <p className="text-[11.5px] font-bold text-muted-foreground">그룹 비율</p>
              <div className="flex h-2 w-full overflow-hidden rounded-full">
                {COMPOSITE_GROUPS.map((g) => (
                  <div key={g} className={GROUP_BAR_COLOR[g]} style={{ width: `${groupWeights[g]}%` }} />
                ))}
              </div>
              <div className="space-y-3">
                {COMPOSITE_GROUPS.map((g) => (
                  <div key={g} className="space-y-1">
                    <div className="flex items-baseline justify-between text-[12px]">
                      <span>{GROUP_LABEL[g]}</span>
                      <span className="tabular-nums font-bold">{Math.round(groupWeights[g])}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(groupWeights[g])}
                      onChange={(e) => onGroupChange(rebalance(groupWeights, COMPOSITE_GROUPS, g, Number(e.target.value)))}
                      className="w-full accent-primary"
                    />
                  </div>
                ))}
              </div>
              <p className={cn("text-right text-[11px] font-medium tabular-nums", Math.abs(groupTotal - 100) <= 1 ? "text-good" : "text-bad")}>
                합계 {groupTotal}%
              </p>
            </div>

            <div className="border-t pt-4">
              <p className="mb-2 text-[11.5px] font-bold text-muted-foreground">재무 세부축 비율 (재무 그룹 내부 배분)</p>
              <div className="flex h-2 w-full overflow-hidden rounded-full">
                {AXES.map((axis) => (
                  <div key={axis} className={AXIS_BAR_COLOR[axis]} style={{ width: `${weights[axis]}%` }} />
                ))}
              </div>
              <div className="mt-3 space-y-3">
                {AXES.map((axis) => (
                  <div key={axis} className="space-y-1">
                    <div className="flex items-baseline justify-between text-[12px]">
                      <span>{axis}</span>
                      <span className="tabular-nums font-bold">{Math.round(weights[axis])}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(weights[axis])}
                      onChange={(e) => onChange(rebalance(weights, AXES, axis, Number(e.target.value)))}
                      className="w-full accent-primary"
                    />
                  </div>
                ))}
              </div>
              <p className={cn("mt-2 text-right text-[11px] font-medium tabular-nums", Math.abs(axisTotal - 100) <= 1 ? "text-good" : "text-bad")}>
                합계 {axisTotal}%
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Badge() {
  return <span className="h-1.5 w-1.5 rounded-full bg-primary" />;
}

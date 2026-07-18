"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { AXES, type Axis } from "@/types";
import { cn } from "@/lib/utils";
import { DEFAULT_AXIS_WEIGHTS } from "@/lib/scoring";

const AXIS_BAR_COLOR: Record<Axis, string> = {
  성장성: "bg-axis-growth",
  수익성: "bg-axis-profit",
  효율성: "bg-axis-efficiency",
  안정성: "bg-axis-stability",
};

function rebalance(weights: Record<Axis, number>, axis: Axis, rawValue: number): Record<Axis, number> {
  const value = Math.max(0, Math.min(100, rawValue));
  const others = AXES.filter((a) => a !== axis);
  const otherSum = others.reduce((s, a) => s + weights[a], 0);
  const remaining = 100 - value;
  const next = { ...weights, [axis]: value };
  if (otherSum <= 0) {
    others.forEach((a) => (next[a] = remaining / others.length));
  } else {
    others.forEach((a) => (next[a] = (weights[a] * remaining) / otherSum));
  }
  return next;
}

export function WeightPopover({ weights, onChange }: { weights: Record<Axis, number>; onChange: (w: Record<Axis, number>) => void }) {
  const [open, setOpen] = useState(false);
  const total = Math.round(AXES.reduce((s, a) => s + weights[a], 0));
  const isCustom = AXES.some((a) => Math.abs(weights[a] - DEFAULT_AXIS_WEIGHTS[a]) > 0.5);

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
          <div className="absolute right-0 top-full z-20 mt-2 w-[320px] space-y-4 rounded-xl bg-card p-4 shadow-modal">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-bold">축 가중치 조정</p>
              <button onClick={() => onChange(DEFAULT_AXIS_WEIGHTS)} className="text-[11.5px] text-primary hover:underline">
                초기화
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              한 축을 조정하면 나머지 축이 비례 재분배되어 합계 100%를 유지합니다. 종합점수는 이 화면에서만 쓰이는 임시 가중평균입니다.
            </p>

            <div className="flex h-2 w-full overflow-hidden rounded-full">
              {AXES.map((axis) => (
                <div key={axis} className={AXIS_BAR_COLOR[axis]} style={{ width: `${weights[axis]}%` }} />
              ))}
            </div>

            <div className="space-y-3">
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
                    onChange={(e) => onChange(rebalance(weights, axis, Number(e.target.value)))}
                    className="w-full accent-primary"
                  />
                </div>
              ))}
            </div>

            <p className={cn("text-right text-[11px] font-medium tabular-nums", Math.abs(total - 100) <= 1 ? "text-good" : "text-bad")}>
              합계 {total}%
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function Badge() {
  return <span className="h-1.5 w-1.5 rounded-full bg-primary" />;
}

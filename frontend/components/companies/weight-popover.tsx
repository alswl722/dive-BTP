"use client";

import { useEffect, useState } from "react";
import { Check, SlidersHorizontal } from "lucide-react";
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

  // 슬라이더는 초안(draft)만 바꾸고, '적용'을 눌러야 실제 종합점수에 반영된다.
  // 즉시 반영이면 슬라이더를 미는 매 프레임마다 표 전체가 재계산·재정렬돼
  // 값이 어디로 튀는지 읽기 어렵다.
  const [draftGroup, setDraftGroup] = useState(groupWeights);
  const [draftAxis, setDraftAxis] = useState(weights);
  const [appliedFlash, setAppliedFlash] = useState(false);

  // 팝오버를 열 때(또는 외부에서 가중치가 바뀌었을 때) 초안을 현재 적용값으로 맞춘다
  useEffect(() => {
    if (open) {
      setDraftGroup(groupWeights);
      setDraftAxis(weights);
    }
  }, [open, groupWeights, weights]);

  const axisTotal = Math.round(AXES.reduce((s, a) => s + draftAxis[a], 0));
  const groupTotal = Math.round(COMPOSITE_GROUPS.reduce((s, g) => s + draftGroup[g], 0));
  const isCustom = isCustomWeights(groupWeights, weights); // 버튼 표시는 '적용된' 값 기준

  // 초안이 적용값과 다른가 — '적용' 활성화 조건
  const dirty =
    COMPOSITE_GROUPS.some((g) => Math.abs(draftGroup[g] - groupWeights[g]) > 0.5) ||
    AXES.some((a) => Math.abs(draftAxis[a] - weights[a]) > 0.5);

  function resetDraft() {
    // 기본값으로 되돌리기 — 초안만 바꾸고 '적용'을 눌러야 반영(다른 조작과 일관)
    setDraftGroup(DEFAULT_GROUP_WEIGHTS);
    setDraftAxis(DEFAULT_AXIS_WEIGHTS);
  }

  function apply() {
    onGroupChange(draftGroup);
    onChange(draftAxis);
    setAppliedFlash(true);
    window.setTimeout(() => setAppliedFlash(false), 1500);
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
        종합 점수 가중치 조정
        {isCustom && <Badge />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-2 w-[340px] space-y-5 rounded-xl bg-card p-4 shadow-modal">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-bold">종합 점수 가중치 조정</p>
              <button onClick={resetDraft} className="text-[11.5px] text-primary hover:underline">
                기본값으로
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
                  <div key={g} className={GROUP_BAR_COLOR[g]} style={{ width: `${draftGroup[g]}%` }} />
                ))}
              </div>
              <div className="space-y-3">
                {COMPOSITE_GROUPS.map((g) => (
                  <div key={g} className="space-y-1">
                    <div className="flex items-baseline justify-between text-[12px]">
                      <span>{GROUP_LABEL[g]}</span>
                      <span className="tabular-nums font-bold">{Math.round(draftGroup[g])}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(draftGroup[g])}
                      onChange={(e) => setDraftGroup(rebalance(draftGroup, COMPOSITE_GROUPS, g, Number(e.target.value)))}
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
                  <div key={axis} className={AXIS_BAR_COLOR[axis]} style={{ width: `${draftAxis[axis]}%` }} />
                ))}
              </div>
              <div className="mt-3 space-y-3">
                {AXES.map((axis) => (
                  <div key={axis} className="space-y-1">
                    <div className="flex items-baseline justify-between text-[12px]">
                      <span>{axis}</span>
                      <span className="tabular-nums font-bold">{Math.round(draftAxis[axis])}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(draftAxis[axis])}
                      onChange={(e) => setDraftAxis(rebalance(draftAxis, AXES, axis, Number(e.target.value)))}
                      className="w-full accent-primary"
                    />
                  </div>
                ))}
              </div>
              <p className={cn("mt-2 text-right text-[11px] font-medium tabular-nums", Math.abs(axisTotal - 100) <= 1 ? "text-good" : "text-bad")}>
                합계 {axisTotal}%
              </p>
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-[11px] text-muted-foreground">
                {dirty ? "변경사항이 아직 적용되지 않았습니다" : appliedFlash ? "적용되었습니다" : "종합점수에 즉시 반영됩니다"}
              </span>
              <button
                type="button"
                onClick={apply}
                disabled={!dirty}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[12px] font-medium transition-colors",
                  dirty
                    ? "bg-primary text-primary-foreground hover:opacity-90"
                    : appliedFlash
                      ? "bg-good-bg text-good"
                      : "bg-muted text-muted-foreground"
                )}
              >
                <Check className="h-3.5 w-3.5" />
                {appliedFlash && !dirty ? "적용됨" : "적용"}
              </button>
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

"use client";

import { useState } from "react";
import { Filter } from "lucide-react";
import { AXES, type Axis } from "@/types";
import { cn } from "@/lib/utils";
import { countAdvancedFilters, defaultFilters, type CompanyFilters } from "@/lib/company-filters";

const AXIS_TEXT_COLOR: Record<Axis, string> = {
  성장성: "text-axis-growth",
  수익성: "text-axis-profit",
  효율성: "text-axis-efficiency",
  안정성: "text-axis-stability",
};

/** 연속값(슬라이더) 필터 — 종합점수/4축 최소점수/지원이력. 축가중치조정 버튼과 같은 톤의
 *  팝오버로 묶어서 항상 펼쳐진 사이드바 대신 필요할 때만 연다. */
export function AdvancedFilterPopover({
  filters,
  onChange,
}: {
  filters: CompanyFilters;
  onChange: (next: CompanyFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const activeCount = countAdvancedFilters(filters);

  function resetAdvanced() {
    const d = defaultFilters();
    onChange({ ...filters, minOverall: d.minOverall, minAxis: d.minAxis, minSupportYears: d.minSupportYears });
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 rounded-md border bg-subtle px-3 py-1.5 text-[12.5px] font-medium",
          activeCount > 0 ? "border-primary text-primary" : "text-foreground hover:bg-muted"
        )}
      >
        <Filter className="h-3.5 w-3.5" />
        필터
        {activeCount > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-2 w-[300px] space-y-4 rounded-xl bg-card p-4 shadow-modal">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-bold">필터</p>
              <button onClick={resetAdvanced} className="text-[11.5px] text-primary hover:underline">
                초기화
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[12px]">
                <span>종합점수 최소</span>
                <span className="tabular-nums font-bold">{filters.minOverall}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={filters.minOverall}
                onChange={(e) => onChange({ ...filters, minOverall: Number(e.target.value) })}
                className="w-full accent-primary"
              />
            </div>

            <div className="space-y-3 border-t pt-3">
              <p className="text-[11.5px] font-medium text-muted-foreground">축별 최소 점수</p>
              {AXES.map((axis) => (
                <div key={axis} className="space-y-1">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className={AXIS_TEXT_COLOR[axis]}>{axis}</span>
                    <span className="tabular-nums text-muted-foreground">{filters.minAxis[axis]}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={filters.minAxis[axis]}
                    onChange={(e) => onChange({ ...filters, minAxis: { ...filters.minAxis, [axis]: Number(e.target.value) } })}
                    className="w-full accent-primary"
                  />
                </div>
              ))}
            </div>

            <label className="flex items-center justify-between gap-2 border-t pt-3 text-[12px] text-muted-foreground">
              최소 지원연도수
              <input
                type="number"
                min={0}
                value={filters.minSupportYears}
                onChange={(e) => onChange({ ...filters, minSupportYears: Math.max(0, Number(e.target.value)) })}
                className="w-16 rounded-md border bg-subtle px-2 py-1 text-[12px] text-foreground outline-none focus:ring-2 focus:ring-ring/40"
              />
            </label>
          </div>
        </>
      )}
    </div>
  );
}

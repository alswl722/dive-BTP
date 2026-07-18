import { AXES, type AxisScores } from "@/types";
import { cn } from "@/lib/utils";

const AXIS_ABBR: Record<(typeof AXES)[number], string> = { 성장성: "성", 수익성: "수", 효율성: "효", 안정성: "안" };
const AXIS_BAR_COLOR: Record<(typeof AXES)[number], string> = {
  성장성: "bg-axis-growth",
  수익성: "bg-axis-profit",
  효율성: "bg-axis-efficiency",
  안정성: "bg-axis-stability",
};

/** 4축 점수를 2x2 그리드로 압축 표시(표 뷰 전용). */
export function AxisMiniBars({ scores }: { scores: AxisScores }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
      {AXES.map((axis) => {
        const v = scores[axis];
        return (
          <div key={axis} className="flex items-center gap-1.5" title={axis}>
            <span className="w-2.5 shrink-0 text-[9.5px] text-muted-foreground">{AXIS_ABBR[axis]}</span>
            <div className="h-1.5 w-9 shrink-0 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", AXIS_BAR_COLOR[axis])}
                style={{ width: `${v == null ? 0 : Math.max(4, Math.min(100, v))}%` }}
              />
            </div>
            <span className="w-4 shrink-0 text-[10px] tabular-nums text-muted-foreground">{v == null ? "—" : Math.round(v)}</span>
          </div>
        );
      })}
    </div>
  );
}

import { AXES, type AxisScores } from "@/types";
import { cn } from "@/lib/utils";

// 톤온톤 명도 단계 — 개요 탭 세로 막대 차트와 동일한 문법(성장성 진함 → 안정성 연함).
const AXIS_OPACITY: Record<(typeof AXES)[number], string> = {
  성장성: "opacity-100",
  수익성: "opacity-[.78]",
  효율성: "opacity-[.58]",
  안정성: "opacity-[.38]",
};

const LOW_THRESHOLD = 25; // 하위 등급 경계 — 이 미만인 축만 빨강으로 경고

/** 4축 점수 미니 세로 막대(표 뷰 전용). 중앙값 50 점선 + 하위 축 빨강.
 *  숫자는 셀에 안 그리고 title 툴팁으로 — 셀 복잡도를 낮춘다. */
export function AxisMiniBars({ scores }: { scores: AxisScores }) {
  const tooltip = AXES.map((a) => `${a} ${scores[a] == null ? "—" : Math.round(scores[a]!)}`).join(" · ");
  return (
    <div className="relative flex h-[34px] w-[96px] items-end gap-[5px]" title={tooltip}>
      <div className="pointer-events-none absolute inset-x-0 bottom-1/2 border-t border-dashed border-muted-foreground/40" />
      {AXES.map((axis) => {
        const v = scores[axis];
        const low = v != null && v < LOW_THRESHOLD;
        return (
          <div
            key={axis}
            className={cn(
              "min-h-[2px] flex-1 rounded-t-[2px]",
              v == null ? "bg-muted" : low ? "bg-bad" : cn("bg-primary", AXIS_OPACITY[axis])
            )}
            style={{ height: `${v == null ? 6 : Math.max(6, Math.min(100, v))}%` }}
          />
        );
      })}
    </div>
  );
}

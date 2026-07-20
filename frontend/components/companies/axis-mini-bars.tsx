import { AXES, type AxisScores } from "@/types";
import { cn } from "@/lib/utils";

// 톤온톤 명도 단계 — 개요 탭 세로 막대 차트와 동일한 문법(성장성 진함 → 안정성 연함).
const AXIS_OPACITY: Record<(typeof AXES)[number], string> = {
  성장성: "opacity-100",
  수익성: "opacity-[.78]",
  효율성: "opacity-[.58]",
  안정성: "opacity-[.38]",
};

// 표 셀에서 축 이름을 2글자로 압축 — 4개 열이 나란히 서니 짧게 자름.
const AXIS_SHORT: Record<(typeof AXES)[number], string> = {
  성장성: "성장",
  수익성: "수익",
  효율성: "효율",
  안정성: "안정",
};

const LOW_THRESHOLD = 25;   // 하위 등급 경계 — 이 미만 축은 빨강
const BAR_AREA_H = 40;      // 바 최대 높이(px). 점수 100 = 이 높이 통째로
const MIN_BAR_H = 4;        // 값이 0이거나 매우 낮아도 바가 보이도록 최소 높이

/** 4축 점수 미니 세로 막대(표 뷰 전용). 바 위에 점수, 바 아래에 축 이름을 얹어
 *  담당자가 그래프만 보고 어떤 축이 몇 점인지 바로 읽을 수 있게 한다.
 *  점수 텍스트는 각 열이 flex-col-justify-end라 바 상단에 자연스럽게 붙는다. */
export function AxisMiniBars({ scores }: { scores: AxisScores }) {
  return (
    <div className="flex w-[152px] flex-col gap-1">
      <div className="flex h-[44px] items-end gap-[6px]">
        {AXES.map((axis) => {
          const v = scores[axis];
          const low = v != null && v < LOW_THRESHOLD;
          const h = v == null ? MIN_BAR_H : Math.max(MIN_BAR_H, (Math.min(100, v) / 100) * BAR_AREA_H);
          return (
            <div key={axis} className="flex flex-1 flex-col items-center justify-end">
              <span
                className={cn(
                  "text-[10px] font-bold leading-none tabular-nums",
                  v == null ? "text-muted-foreground" : low ? "text-bad" : "text-foreground/80"
                )}
              >
                {v == null ? "—" : Math.round(v)}
              </span>
              <div
                className={cn(
                  "mt-[3px] w-full rounded-t-[2px]",
                  v == null ? "bg-muted" : low ? "bg-bad" : cn("bg-primary", AXIS_OPACITY[axis])
                )}
                style={{ height: `${h}px` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-[6px]">
        {AXES.map((axis) => (
          <span key={axis} className="flex-1 text-center text-[10px] text-muted-foreground">
            {AXIS_SHORT[axis]}
          </span>
        ))}
      </div>
    </div>
  );
}

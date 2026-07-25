import { COMPOSITE_AXES, type CompositeScore } from "@/types";
import { cn } from "@/lib/utils";

// 표 셀용 축 라벨 압축 — 7개 열이 좁게 서니 2글자로 자른다(NTIS만 그대로).
const AXIS_SHORT: Record<(typeof COMPOSITE_AXES)[number], string> = {
  성장성: "성장",
  수익성: "수익",
  효율성: "효율",
  안정성: "안정",
  "R&D특허": "특허",
  NTIS: "NTIS",
  정합성: "정합",
};

const BAR_AREA_H = 46; // 바 최대 높이(px). 점수 100 = 이 높이 통째로
const MIN_BAR_H = 3;   // 값이 0이거나 매우 낮아도 바가 보이도록 최소 높이

/** 종합점수 7축(재무4축·기술2축·정합성) 미니 세로 막대 — 개요 탭 그래프의 표 셀 버전.
 *  단순 4축이 아니라 종합점수를 이루는 전 축을 한 셀에서 보여줘, 담당자가 목록에서
 *  바로 어떤 축이 약한지 읽게 한다. 최저축(캡 근거)은 warn 색으로 강조.
 *  compositeScore가 없으면(데이터 결측) '—' 한 글자로 축소 표기. */
export function CompositeMiniBars({ cs }: { cs: CompositeScore | null }) {
  if (!cs) return <span className="text-[11px] text-muted-foreground">—</span>;

  return (
    <div className="w-[236px]">
      <div className="flex h-[46px] items-end gap-[5px]">
        {COMPOSITE_AXES.map((axis) => {
          const v = cs.breakdown[axis];
          const isLowest = cs.lowestAxis === axis;
          const h = v == null ? MIN_BAR_H : Math.max(MIN_BAR_H, (Math.min(100, v) / 100) * BAR_AREA_H);
          return (
            <div key={axis} className="flex flex-1 flex-col items-center justify-end">
              <span
                className={cn(
                  "text-[9.5px] font-bold leading-none tabular-nums",
                  v == null ? "text-muted-foreground" : isLowest ? "text-warn" : "text-foreground/80"
                )}
              >
                {v == null ? "—" : Math.round(v)}
              </span>
              <div
                className={cn(
                  "mt-[2px] w-full rounded-t-[2px]",
                  v == null ? "bg-muted" : isLowest ? "bg-warn" : "bg-primary/60"
                )}
                style={{ height: `${h}px` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-[3px] flex gap-[5px]">
        {COMPOSITE_AXES.map((axis) => (
          <span
            key={axis}
            className={cn(
              "flex-1 text-center text-[9px] leading-none",
              cs.lowestAxis === axis ? "font-bold text-warn" : "text-muted-foreground"
            )}
          >
            {AXIS_SHORT[axis]}
          </span>
        ))}
      </div>
    </div>
  );
}

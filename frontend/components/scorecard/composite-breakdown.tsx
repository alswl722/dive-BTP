import { ScoreBadge } from "@/components/ui/score-badge";
import { COMPOSITE_AXES, type Company } from "@/types";
import { cn } from "@/lib/utils";

/** 종합점수 + 7축(재무4·기술2·정합성) breakdown 막대.
 *  개요 탭에서 상단(심사요약이 있던 자리)으로 승격 — 탭과 무관하게 항상 노출.
 *  헤더의 종합점수 배지는 커스텀 가중치 반영값이라 다를 수 있어, 여기서는 항상
 *  서버 원본(compositeScore, 최저축 캡 적용)을 보여준다. */
export function CompositeBreakdown({ company }: { company: Company }) {
  const cs = company.compositeScore;
  if (!cs) return null;

  return (
    <div className="rounded-lg border p-3.5">
      <p className="mb-2.5 text-[12.5px] font-bold">
        종합점수 <span className="font-normal text-muted-foreground">(재무4축·기술2축·정합성)</span>
      </p>
      <div className="flex items-center gap-4">
        <ScoreBadge score={cs.score} size="lg" title="종합점수(최저축 캡 적용)" />
        {/* 세로 막대 + 중앙값 50 기준선 — 4축 그래프와 같은 톤. 위 20px(top-5)는
            점수 라벨 여백 — 막대 높이(%)와 50 점선이 같은 스케일을 공유해야 하므로
            라벨은 막대 위 절대배치로 뺀다. */}
        <div className="relative h-[140px] flex-1">
          <div className="absolute inset-x-0 bottom-0 top-5 border-b border-muted-foreground/30">
            <div className="pointer-events-none absolute inset-x-0 bottom-1/2 border-t border-dashed border-muted-foreground/40" />
            <div className="absolute inset-0 flex items-end gap-2 px-1">
              {COMPOSITE_AXES.map((axis) => {
                const v = cs.breakdown[axis];
                const isLowest = cs.lowestAxis === axis;
                const h = v == null ? 2 : Math.max(2, Math.min(100, v));
                return (
                  <div key={axis} className="flex h-full flex-1 items-end justify-center">
                    <div
                      className={cn(
                        "relative w-[70%] max-w-[28px] rounded-t-[4px]",
                        v == null ? "bg-muted" : isLowest ? "bg-warn" : "bg-primary/60"
                      )}
                      style={{ height: `${h}%` }}
                    >
                      <span className="absolute -top-[16px] left-1/2 -translate-x-1/2 text-[11px] font-bold tabular-nums">
                        {v == null ? "—" : Math.round(v)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="flex gap-2 pl-20 pr-1 pt-1.5">
        {COMPOSITE_AXES.map((axis) => (
          <span
            key={axis}
            className={cn(
              "flex-1 text-center text-[10px]",
              cs.lowestAxis === axis ? "font-bold text-warn" : "text-muted-foreground"
            )}
          >
            {axis}
          </span>
        ))}
      </div>
    </div>
  );
}

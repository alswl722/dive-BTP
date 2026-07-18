import { cn } from "@/lib/utils";
import { overallScoreTone } from "@/lib/scoring";

const toneClass: Record<ReturnType<typeof overallScoreTone>, string> = {
  good: "bg-good-bg text-good",
  info: "bg-info-bg text-info",
  slate: "bg-muted text-muted-foreground",
  bad: "bg-bad-bg text-bad",
};

/** 종합점수 원형 배지. size: sm(표/리스트용) | lg(스코어카드 헤더용) */
export function ScoreBadge({ score, size = "sm", className }: { score: number | null; className?: string; size?: "sm" | "lg" }) {
  const tone = overallScoreTone(score);
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-extrabold tabular-nums",
        size === "sm" ? "h-8 w-8 text-[12px]" : "h-16 w-16 text-[22px]",
        toneClass[tone],
        className
      )}
    >
      {score == null ? "—" : Math.round(score)}
    </div>
  );
}

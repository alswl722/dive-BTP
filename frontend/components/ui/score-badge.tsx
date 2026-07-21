import { cn } from "@/lib/utils";
import { overallScoreTone } from "@/lib/scoring";

const toneClass: Record<ReturnType<typeof overallScoreTone>, string> = {
  good: "bg-good-bg text-good",
  info: "bg-info-bg text-info",
  slate: "bg-muted text-muted-foreground",
  bad: "bg-bad-bg text-bad",
};

const sizeClass = {
  sm: "h-8 w-8 text-[12px]",
  lg: "h-16 w-16 text-[22px]",
  xl: "h-24 w-24 text-[40px]",
} as const;

/** 종합점수 원형 배지. size: sm(표/리스트용) | lg(스코어카드 헤더용) | xl(강조) */
export function ScoreBadge({ score, size = "sm", className, title }: { score: number | null; className?: string; size?: keyof typeof sizeClass; title?: string }) {
  const tone = overallScoreTone(score);
  return (
    <div
      title={title}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-extrabold tabular-nums",
        sizeClass[size],
        toneClass[tone],
        className
      )}
    >
      {score == null ? "—" : Math.round(score)}
    </div>
  );
}

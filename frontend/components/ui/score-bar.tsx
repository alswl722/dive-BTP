import { cn, scoreTone } from "@/lib/utils";

const toneBg: Record<string, string> = {
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
  muted: "bg-muted-foreground/40",
};

/** 0~100 점수/백분위 가로 바. label + 수치 + 색 신호. */
export function ScoreBar({
  label,
  value,
  className,
  sub,
}: {
  label: string;
  value: number | null;
  className?: string;
  sub?: string;
}) {
  const tone = scoreTone(value);
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-foreground">{label}</span>
        <span className="tabular-nums font-medium">
          {value == null ? "—" : Math.round(value)}
          {sub && <span className="ml-1 text-xs text-muted-foreground">{sub}</span>}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", toneBg[tone])}
          style={{ width: `${value == null ? 0 : Math.max(2, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

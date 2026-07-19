import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type Variant = "default" | "secondary" | "good" | "info" | "warn" | "bad" | "slate";

// 보더 없이 은은한 배경 틴트만 — 뱃지가 "버튼처럼" 눌러야 할 것 같은 느낌을 줄임.
// good/info/warn/bad는 opacity 틴트가 아니라 디자인 토큰의 실제 bg hex 쌍 사용(고충실도).
// slate = 중립·판정 유보용 (축8 판단유보, 축9 unknown 등 "결정 안 됨" 상태 전용)
const styles: Record<Variant, string> = {
  default: "bg-primary text-primary-foreground",
  secondary: "bg-muted text-muted-foreground",
  good: "bg-good-bg text-good",
  info: "bg-info-bg text-info",
  warn: "bg-warn-bg text-[hsl(30_75%_38%)]",
  bad: "bg-bad-bg text-bad",
  slate: "bg-slate-100 text-slate-600",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        styles[variant],
        className
      )}
      {...props}
    />
  );
}

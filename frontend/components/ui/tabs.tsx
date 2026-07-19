"use client";

// 경량 탭 (radix 미사용). 스코어카드 축 드릴다운 등에 사용.
import { cn } from "@/lib/utils";

export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: string[];
  active: string;
  onChange: (t: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1", className)}>
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={cn(
            "flex-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-center text-[13px] font-medium transition-colors",
            active === t ? "bg-card text-accent shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

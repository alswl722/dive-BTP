"use client";

import { Check, ChevronDown, Pause, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { REVIEW_STATUSES, type ReviewStatus } from "@/types";

const OPTIONS: { status: ReviewStatus; icon: typeof Check; activeClass: string; label: string }[] = [
  { status: "선정", icon: Check, activeClass: "bg-good text-white", label: "선정" },
  { status: "보류", icon: Pause, activeClass: "bg-warn text-white", label: "보류" },
  { status: "제외", icon: X, activeClass: "bg-bad text-white", label: "제외" },
];

/** 선정/보류/제외 3버튼 토글. 다시 누르면 "후보"로 돌아감. 표/보드/스코어카드 헤더 공용. */
export function StatusButtons({
  status,
  onChange,
  size = "md",
}: {
  status: ReviewStatus;
  onChange: (next: ReviewStatus) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex items-center gap-1">
      {OPTIONS.map(({ status: s, icon: Icon, activeClass, label }) => {
        const active = status === s;
        return (
          <button
            key={s}
            title={label}
            onClick={(e) => {
              e.stopPropagation();
              onChange(active ? "후보" : s);
            }}
            className={cn(
              "flex items-center justify-center rounded-md transition-colors",
              size === "sm" ? "h-6 w-6" : "h-8 w-8",
              active ? activeClass : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
          </button>
        );
      })}
    </div>
  );
}

const STATUS_TONE: Record<ReviewStatus, string> = {
  후보: "text-info",
  선정: "text-good",
  보류: "text-[hsl(30_75%_38%)]",
  제외: "text-bad",
};

/** 보드 카드용 — 상태를 드롭다운(select)으로 변경. */
export function StatusDropdown({ status, onChange }: { status: ReviewStatus; onChange: (next: ReviewStatus) => void }) {
  return (
    <div className="relative">
      <select
        value={status}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(e.target.value as ReviewStatus)}
        className={cn(
          "appearance-none rounded-md border bg-card py-1 pl-2.5 pr-6 text-[11px] font-medium outline-none",
          STATUS_TONE[status]
        )}
      >
        {REVIEW_STATUSES.map((s) => (
          <option key={s} value={s} className="text-foreground">
            {s}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

const STACK_OPTIONS: { status: ReviewStatus; activeClass: string; label: string }[] = [
  { status: "선정", activeClass: "border-good bg-good-bg text-good", label: "선정" },
  { status: "보류", activeClass: "border-warn bg-warn-bg text-[hsl(30_75%_38%)]", label: "보류" },
  { status: "제외", activeClass: "border-bad bg-bad-bg text-bad", label: "제외" },
];

/** 스코어카드 헤더용 — 세로 라벨 스택. */
export function StatusStack({ status, onChange }: { status: ReviewStatus; onChange: (next: ReviewStatus) => void }) {
  return (
    <div className="flex flex-col gap-1">
      {STACK_OPTIONS.map(({ status: s, activeClass, label }) => {
        const active = status === s;
        return (
          <button
            key={s}
            onClick={() => onChange(active ? "후보" : s)}
            className={cn(
              "rounded-md border px-3 py-1 text-[11.5px] font-medium transition-colors",
              active ? activeClass : "border-border text-muted-foreground hover:bg-muted"
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

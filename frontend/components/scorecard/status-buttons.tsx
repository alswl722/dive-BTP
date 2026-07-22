"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { REVIEW_STATUSES, type ReviewStatus } from "@/types";

const OPTIONS: { status: ReviewStatus; activeClass: string; label: string }[] = [
  { status: "선정", activeClass: "bg-good text-white", label: "선정" },
  { status: "제외", activeClass: "bg-bad text-white", label: "제외" },
];

/** 선정/제외 2버튼 토글. 다시 누르면 "후보"로 돌아감. 표/보드/스코어카드 헤더 공용.
 *  아이콘은 셀 폭에서 뜻이 잘 안 잡혀(체크/일시정지/X → 담당자에게 학습 부담) 텍스트 라벨로 노출. */
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
      {OPTIONS.map(({ status: s, activeClass, label }) => {
        const active = status === s;
        return (
          <button
            key={s}
            onClick={(e) => {
              e.stopPropagation();
              onChange(active ? "후보" : s);
            }}
            className={cn(
              "rounded-md font-medium transition-colors",
              size === "sm" ? "h-6 px-2 text-[11px]" : "h-8 px-3 text-[12px]",
              active ? activeClass : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

const STATUS_TONE: Record<ReviewStatus, string> = {
  후보: "text-info",
  선정: "text-good",
  제외: "text-bad",
};

/** 보드 카드용 — 상태를 드롭다운(select)으로 변경. disabled면 배정된 담당자·관리자가
 *  아니라는 뜻 — 조회(카드 자체)는 그대로 보이고 상태 변경만 잠근다. */
export function StatusDropdown({
  status,
  onChange,
  disabled = false,
}: {
  status: ReviewStatus;
  onChange: (next: ReviewStatus) => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={status}
        disabled={disabled}
        title={disabled ? "배정된 담당자만 심사" : undefined}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(e.target.value as ReviewStatus)}
        className={cn(
          "appearance-none rounded-md border bg-card py-1 pl-2.5 pr-6 text-[11px] font-medium outline-none",
          disabled ? "cursor-not-allowed opacity-40" : STATUS_TONE[status]
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
  { status: "후보", activeClass: "border-info bg-info-bg text-info", label: "후보" },
  { status: "제외", activeClass: "border-bad bg-bad-bg text-bad", label: "제외" },
];

/** 스코어카드 헤더용 — 세로 라벨 스택. 각 버튼이 목표 상태를 직접 지정(토글 아님) —
 *  "후보"가 버튼으로 명시돼 있어 굳이 활성 버튼을 다시 눌러 해제할 필요가 없다.
 *  상태는 사업 단위 — 사업 미선택이거나 배정된 담당자·관리자가 아니면 disabled + 사유 안내.
 *  조회 자체는 배정과 무관하게 항상 가능(투명성) — 이 잠금은 "결정"만 막는다. */
export function StatusStack({
  status,
  onChange,
  disabled = false,
  lockReason = "사업을 선택해 심사",
}: {
  status: ReviewStatus;
  onChange: (next: ReviewStatus) => void;
  disabled?: boolean;
  lockReason?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      {STACK_OPTIONS.map(({ status: s, activeClass, label }) => {
        const active = status === s;
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            disabled={disabled}
            className={cn(
              "rounded-md border px-3 py-1 text-[11.5px] font-medium transition-colors",
              disabled && "cursor-not-allowed opacity-40",
              active && !disabled ? activeClass : "border-border text-muted-foreground hover:bg-muted"
            )}
          >
            {label}
          </button>
        );
      })}
      {disabled && (
        <p className="max-w-[72px] text-[9.5px] leading-tight text-muted-foreground">
          {lockReason}
        </p>
      )}
    </div>
  );
}

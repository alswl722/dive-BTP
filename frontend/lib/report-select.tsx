"use client";

// 리포트 편집 선택 프레임워크 — 실제 스코어카드를 그대로 왼쪽에 띄우고, 선택모드일 때만
// 각 블록에 체크박스를 오버레이한다. 선택모드가 아니면 children을 그대로 렌더(실제 상세페이지
// 화면에는 아무 영향 없음). 체크된 블록은 data-report-* 속성으로 표시돼, 빌더가 DOM에서
// 순서대로 찾아 html2canvas로 캡처(이미지)하거나 데이터로 쓴다.

import { createContext, useContext, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PartKind = "chart" | "data";

interface SelectCtx {
  active: boolean;
  selected: Set<string>;
  toggle: (id: string) => void;
}

const Ctx = createContext<SelectCtx | null>(null);

export function ReportSelectProvider({ value, children }: { value: SelectCtx; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReportSelect() {
  return useContext(Ctx);
}

/**
 * 리포트에 담을 수 있는 블록 래퍼. 선택모드가 아니면 그대로 통과(실제 화면 무변경).
 * @param id    고유 키 (기업 내 유일)
 * @param label 오른쪽/PDF에 표기할 이름
 * @param kind  "chart"=이미지(캡처), "data"=표/텍스트. CSV 내보내기 시 chart가 있으면 안내.
 */
export function Selectable({
  id,
  label,
  kind = "data",
  children,
}: {
  id: string;
  label: string;
  kind?: PartKind;
  children: ReactNode;
}) {
  const ctx = useContext(Ctx);
  if (!ctx || !ctx.active) return <>{children}</>;
  const on = ctx.selected.has(id);
  return (
    <div
      data-report-id={id}
      data-report-kind={kind}
      data-report-label={label}
      className={cn(
        "relative rounded-lg transition-shadow",
        on ? "ring-2 ring-primary" : "ring-1 ring-primary/20 hover:ring-primary/50"
      )}
    >
      <button
        type="button"
        data-report-btn
        onClick={() => ctx.toggle(id)}
        title={on ? "담기 해제" : "리포트에 담기"}
        className={cn(
          "absolute right-1.5 top-1.5 z-20 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium shadow-card",
          on ? "bg-primary text-primary-foreground" : "border bg-card/95 text-muted-foreground"
        )}
      >
        <span className={cn("flex h-3 w-3 items-center justify-center rounded-[3px] border", on ? "border-primary-foreground bg-primary-foreground/20" : "border-current")}>
          {on ? "✓" : ""}
        </span>
        {kind === "chart" ? "이미지" : "담기"}
      </button>
      {children}
    </div>
  );
}

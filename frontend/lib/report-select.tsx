"use client";

// 리포트 편집 선택 프레임워크 — 실제 스코어카드를 그대로 왼쪽에 띄우고, 선택모드일 때만
// 각 블록에 체크박스를 오버레이한다. 선택모드가 아니면 children을 그대로 렌더(실제 상세페이지
// 화면에는 아무 영향 없음). 체크된 블록은 data-report-id로 표시돼, 빌더가 DOM에서
// 순서대로 찾아 html2canvas로 캡처(이미지)하거나 데이터로 쓴다.
//
// 라벨·종류(chart/data)는 여기서 받지 않고 REPORT_BLOCKS에서만 읽는다 — 예전엔 JSX prop과
// 레지스트리 양쪽에 선언해서 실제로 어긋난 적이 있다(버튼은 "담기"인데 저장물엔 다른 이름).

import { createContext, useContext, type ReactNode } from "react";
import { REPORT_BLOCKS, type BlockId } from "@/lib/report-blocks";
import { cn } from "@/lib/utils";

interface SelectCtx {
  active: boolean;
  selected: Set<string>;
  toggle: (id: BlockId) => void;
}

const Ctx = createContext<SelectCtx | null>(null);

export function ReportSelectProvider({ value, children }: { value: SelectCtx; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * 리포트에 담을 수 있는 블록 래퍼. 선택모드가 아니면 그대로 통과(실제 화면 무변경).
 * @param id REPORT_BLOCKS의 키. 오타·누락은 컴파일 타임에 걸린다.
 */
export function Selectable({ id, children }: { id: BlockId; children: ReactNode }) {
  const ctx = useContext(Ctx);
  if (!ctx || !ctx.active) return <>{children}</>;
  const on = ctx.selected.has(id);
  const isChart = REPORT_BLOCKS[id].kind === "chart";
  return (
    <div
      data-report-id={id}
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
        <span
          className={cn(
            "flex h-3 w-3 items-center justify-center rounded-[3px] border",
            on ? "border-primary-foreground bg-primary-foreground/20" : "border-current"
          )}
        >
          {on ? "✓" : ""}
        </span>
        {isChart ? "이미지" : "담기"}
      </button>
      {children}
    </div>
  );
}

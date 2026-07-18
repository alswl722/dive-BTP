"use client";

// 화면 전반에서 공유하는 클라이언트 상태: 찜 상태(선정/보류/제외), 사이드바 접힘, 표/보드 뷰 모드.
// 페이지 이동(서버 컴포넌트 재요청)과 무관하게 즉시 반영되도록 컨텍스트로 둔다.
// 찜 상태는 낙관적 업데이트 후 백엔드에 PATCH(API_BASE 없으면 세션 내 유지만).

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { ReviewStatus } from "@/types";
import { updateReviewStatus } from "@/lib/api";

interface ReviewStatusContextValue {
  statuses: Record<number, ReviewStatus>;
  setStatus: (id: number, status: ReviewStatus) => void;
}

const ReviewStatusContext = createContext<ReviewStatusContextValue | null>(null);

export function ReviewStatusProvider({
  initial,
  children,
}: {
  initial: Record<number, ReviewStatus>;
  children: ReactNode;
}) {
  const [statuses, setStatuses] = useState(initial);

  const setStatus = useCallback((id: number, status: ReviewStatus) => {
    let previous: ReviewStatus | undefined;
    setStatuses((prev) => {
      previous = prev[id];
      return { ...prev, [id]: status };
    });
    updateReviewStatus(id, status).catch((err) => {
      console.error("찜 상태 저장 실패, 이전 상태로 롤백:", err);
      setStatuses((prev) => (previous === undefined ? prev : { ...prev, [id]: previous }));
    });
  }, []);

  return <ReviewStatusContext.Provider value={{ statuses, setStatus }}>{children}</ReviewStatusContext.Provider>;
}

export function useReviewStatus() {
  const ctx = useContext(ReviewStatusContext);
  if (!ctx) throw new Error("useReviewStatus는 ReviewStatusProvider 안에서만 사용");
  return ctx;
}

type ViewMode = "table" | "board";

interface UiContextValue {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
}

const UiContext = createContext<UiContextValue | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const toggleSidebar = useCallback(() => setSidebarCollapsed((v) => !v), []);
  return (
    <UiContext.Provider value={{ sidebarCollapsed, toggleSidebar, viewMode, setViewMode }}>
      {children}
    </UiContext.Provider>
  );
}

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error("useUi는 UiProvider 안에서만 사용");
  return ctx;
}

"use client";

// 화면 전반에서 공유하는 클라이언트 상태: 찜 상태(선정/제외), 사이드바 접힘, 표/보드 뷰 모드.
// 페이지 이동(서버 컴포넌트 재요청)과 무관하게 즉시 반영되도록 컨텍스트로 둔다.
// 찜 상태는 낙관적 업데이트 후 백엔드에 PATCH(API_BASE 없으면 세션 내 유지만).

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Axis, CompositeGroup, ReviewStatus } from "@/types";
import type { TechAxis } from "@/lib/scoring";
import { updateReviewStatus } from "@/lib/api";
import { statusKey } from "@/lib/status-key";

export const DEFAULT_REVIEW_STATUS: ReviewStatus = "후보";

interface ReviewStatusContextValue {
  statuses: Record<string, ReviewStatus>; // key = statusKey(companyId, programKey)
  statusOf: (companyId: number, programKey: string | null | undefined) => ReviewStatus;
  /** 심사 결정 사유(선정/제외 시 기록). key = statusKey. */
  reasons: Record<string, string>;
  reasonOf: (companyId: number, programKey: string | null | undefined) => string;
  setStatus: (companyId: number, programKey: string, status: ReviewStatus, reason?: string) => void;
}

const ReviewStatusContext = createContext<ReviewStatusContextValue | null>(null);

export function ReviewStatusProvider({
  initial,
  children,
}: {
  initial: Record<string, ReviewStatus>;
  children: ReactNode;
}) {
  const [statuses, setStatuses] = useState(initial);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const statusOf = useCallback(
    (companyId: number, programKey: string | null | undefined): ReviewStatus =>
      programKey ? statuses[statusKey(companyId, programKey)] ?? DEFAULT_REVIEW_STATUS : DEFAULT_REVIEW_STATUS,
    [statuses],
  );

  const reasonOf = useCallback(
    (companyId: number, programKey: string | null | undefined): string =>
      programKey ? reasons[statusKey(companyId, programKey)] ?? "" : "",
    [reasons],
  );

  const setStatus = useCallback((companyId: number, programKey: string, status: ReviewStatus, reason?: string) => {
    const key = statusKey(companyId, programKey);
    let previous: ReviewStatus | undefined;
    setStatuses((prev) => {
      previous = prev[key];
      return { ...prev, [key]: status };
    });
    // 사유 갱신 — 후보(미결정)로 돌아가면 사유는 지운다. reason 미지정이면 기존 사유 유지.
    setReasons((prev) => {
      const next = { ...prev };
      if (status === DEFAULT_REVIEW_STATUS) delete next[key];
      else if (reason !== undefined) next[key] = reason;
      return next;
    });
    updateReviewStatus(companyId, programKey, status).catch((err) => {
      console.error("심사 상태 저장 실패, 이전 상태로 롤백:", err);
      setStatuses((prev) => {
        const next = { ...prev };
        if (previous === undefined) delete next[key];
        else next[key] = previous;
        return next;
      });
    });
  }, []);

  return (
    <ReviewStatusContext.Provider value={{ statuses, statusOf, reasons, reasonOf, setStatus }}>
      {children}
    </ReviewStatusContext.Provider>
  );
}

export function useReviewStatus() {
  const ctx = useContext(ReviewStatusContext);
  if (!ctx) throw new Error("useReviewStatus는 ReviewStatusProvider 안에서만 사용");
  return ctx;
}

type ViewMode = "table" | "board";
export type Theme = "light" | "dark";
export const PAGE_SIZE_OPTIONS = [8, 15, 30] as const;

/** 저장된 기본 종합점수 가중치. null이면 시스템 기본값(DEFAULT_*)을 쓴다. */
export interface DefaultWeights {
  group: Record<CompositeGroup, number>;
  finance: Record<Axis, number>;
  tech: Record<TechAxis, number>;
}

interface UiContextValue {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  pageSize: number;
  setPageSize: (n: number) => void;
  /** 심사자가 저장한 기본 가중치(없으면 null). */
  defaultWeights: DefaultWeights | null;
  setDefaultWeights: (w: DefaultWeights | null) => void;
}

const UiContext = createContext<UiContextValue | null>(null);

// 화면 설정은 브라우저에 영속화 — '설정을 바꿔도 새로고침하면 초기화'되던 어색함 제거.
const UI_KEY = "btp.ui";

interface PersistedUi {
  sidebarCollapsed: boolean;
  viewMode: ViewMode;
  theme: Theme;
  pageSize: number;
  defaultWeights: DefaultWeights | null;
}

const UI_DEFAULT: PersistedUi = {
  sidebarCollapsed: false,
  viewMode: "table",
  theme: "light",
  pageSize: 8,
  defaultWeights: null,
};

export function UiProvider({ children }: { children: ReactNode }) {
  const [ui, setUi] = useState<PersistedUi>(UI_DEFAULT);

  // 복원 — 이전 버전 저장값에 없던 키는 기본값과 병합
  useEffect(() => {
    try {
      const raw = localStorage.getItem(UI_KEY);
      if (raw) setUi({ ...UI_DEFAULT, ...(JSON.parse(raw) as Partial<PersistedUi>) });
    } catch {
      /* 깨진 값이면 기본값 */
    }
  }, []);

  // 테마 적용 — <html data-theme>. globals.css의 [data-theme="dark"]가 변수를 덮는다.
  useEffect(() => {
    document.documentElement.dataset.theme = ui.theme;
  }, [ui.theme]);

  const persist = useCallback((patch: Partial<PersistedUi>) => {
    setUi((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(UI_KEY, JSON.stringify(next));
      } catch {
        /* 저장 실패해도 이번 세션은 동작 */
      }
      return next;
    });
  }, []);

  const value: UiContextValue = {
    sidebarCollapsed: ui.sidebarCollapsed,
    toggleSidebar: () => persist({ sidebarCollapsed: !ui.sidebarCollapsed }),
    viewMode: ui.viewMode,
    setViewMode: (v) => persist({ viewMode: v }),
    theme: ui.theme,
    setTheme: (t) => persist({ theme: t }),
    pageSize: ui.pageSize,
    setPageSize: (n) => persist({ pageSize: n }),
    defaultWeights: ui.defaultWeights,
    setDefaultWeights: (w) => persist({ defaultWeights: w }),
  };

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error("useUi는 UiProvider 안에서만 사용");
  return ctx;
}

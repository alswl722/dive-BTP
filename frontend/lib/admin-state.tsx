"use client";

// 관리자 기능 상태 — 심사 잠금 · 담당 배정 · 사업 확정.
//
// ⚠️ 현재는 클라이언트 상태 + sessionStorage다(백엔드 미연동). 새로고침은 견디지만
//    다른 사용자와 공유되지 않는다. 실 운영에서는 review_status처럼 PATCH API로
//    영속화해야 한다 — 그때 이 훅의 setter만 API 호출로 바꾸면 화면은 그대로다.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/** 잠금: 심사가 확정된 기업의 상태 변경을 막는다(관리자만 해제 가능). */
export type LockMap = Record<number, boolean>;
/** 배정: 사업코드("year:code") → 담당자 username */
export type AssignMap = Record<string, string>;
/** 확정: 사업코드("year:code") → 관리자 점검 완료 */
export type ConfirmMap = Record<string, boolean>;

interface AdminContextValue {
  locks: LockMap;
  toggleLock: (companyId: number) => void;
  isLocked: (companyId: number) => boolean;
  assigns: AssignMap;
  setAssign: (programKey: string, username: string) => void;
  confirms: ConfirmMap;
  toggleConfirm: (programKey: string) => void;
}

const AdminContext = createContext<AdminContextValue | null>(null);
const KEY = "btp.admin";

interface Persisted {
  locks: LockMap;
  assigns: AssignMap;
  confirms: ConfirmMap;
}

export function AdminStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>({ locks: {}, assigns: {}, confirms: {} });

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) setState(JSON.parse(raw) as Persisted);
    } catch {
      /* 저장값이 깨졌으면 초기값 */
    }
  }, []);

  const persist = useCallback((next: Persisted) => {
    setState(next);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* 저장 실패해도 이번 세션은 동작 */
    }
  }, []);

  const toggleLock = useCallback((companyId: number) => {
    setState((prev) => {
      const next = { ...prev, locks: { ...prev.locks, [companyId]: !prev.locks[companyId] } };
      try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  const setAssign = useCallback((programKey: string, username: string) => {
    setState((prev) => {
      const next = { ...prev, assigns: { ...prev.assigns, [programKey]: username } };
      try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  const toggleConfirm = useCallback((programKey: string) => {
    setState((prev) => {
      const next = { ...prev, confirms: { ...prev.confirms, [programKey]: !prev.confirms[programKey] } };
      try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  const isLocked = useCallback((companyId: number) => Boolean(state.locks[companyId]), [state.locks]);

  void persist; // 개별 setter에서 직접 저장 — 남겨두면 향후 일괄 저장에 사용

  return (
    <AdminContext.Provider
      value={{
        locks: state.locks, toggleLock, isLocked,
        assigns: state.assigns, setAssign,
        confirms: state.confirms, toggleConfirm,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}

export function useAdminState() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdminState는 AdminStateProvider 안에서만 사용");
  return ctx;
}

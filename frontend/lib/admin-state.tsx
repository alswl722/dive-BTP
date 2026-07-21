"use client";

// 관리자 기능 상태 — 심사 잠금 · 담당 배정 · 사업 확정.
//
// ⚠️ 현재는 클라이언트 상태 + localStorage다(백엔드 미연동). 실 운영에서는
//    review_status처럼 PATCH API로 영속화해야 한다 — 그때 이 훅의 setter만
//    API 호출로 바꾸면 화면은 그대로다.
//
//    sessionStorage가 아니라 localStorage인 이유: 배정·잠금은 원래 서버에 있고
//    모든 사용자가 공유하는 값이다. sessionStorage는 탭 단위로 격리돼서
//    "관리자 탭에서 배정 → 심사자 탭에서 확인"이 아예 동작하지 않는다.
//    (로그인 세션은 반대로 탭이 닫히면 만료되는 게 맞아 sessionStorage 유지)

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { ProgramStatus } from "@/lib/program-status";

/** 잠금: 심사가 확정된 기업의 상태 변경을 막는다(관리자만 해제 가능). */
export type LockMap = Record<number, boolean>;
/** 배정: 사업코드("year:code") → 담당자 username */
export type AssignMap = Record<string, string>;
/**
 * 상태 지정: 사업코드("year:code") → 관리자가 직접 지정한 진행 상태.
 * 기본 상태는 시작·종료일로 자동 판정되지만(programStatus), 실제 운영에서는
 * 일정과 무관하게 조기 마감·연장되는 사업이 있어 관리자가 덮어쓸 수 있어야 한다.
 * 키가 없으면 자동 판정을 그대로 쓴다(= '자동').
 */
export type StatusMap = Record<string, ProgramStatus>;

interface AdminContextValue {
  locks: LockMap;
  toggleLock: (companyId: number) => void;
  isLocked: (companyId: number) => boolean;
  assigns: AssignMap;
  setAssign: (programKey: string, username: string) => void;
  /** 배정 일괄 반영 — 화면에서 초안을 모아 '저장'으로 한 번에 커밋한다. */
  applyAssigns: (next: AssignMap) => void;
  statuses: StatusMap;
  setProgramStatus: (programKey: string, status: ProgramStatus | null) => void;
}

const AdminContext = createContext<AdminContextValue | null>(null);
const KEY = "btp.admin";

interface Persisted {
  locks: LockMap;
  assigns: AssignMap;
  statuses: StatusMap;
}

const EMPTY: Persisted = { locks: {}, assigns: {}, statuses: {} };

export function AdminStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(EMPTY);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      // 이전 버전 저장값에 없던 키가 있을 수 있어 기본값과 병합한다(undefined 접근 방지)
      if (raw) setState({ ...EMPTY, ...(JSON.parse(raw) as Partial<Persisted>) });
    } catch {
      /* 저장값이 깨졌으면 초기값 */
    }
    // 다른 탭에서 바뀌면 따라간다 — 관리자 탭에서 배정하면 심사자 탭이
    // 새로고침 없이 갱신된다(localStorage의 storage 이벤트는 '다른 탭'에서만 발생).
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      try {
        setState(e.newValue ? { ...EMPTY, ...(JSON.parse(e.newValue) as Partial<Persisted>) } : EMPTY);
      } catch {
        /* 깨진 값이면 무시 */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persist = useCallback((next: Persisted) => {
    setState(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* 저장 실패해도 이번 세션은 동작 */
    }
  }, []);

  const toggleLock = useCallback((companyId: number) => {
    setState((prev) => {
      const next = { ...prev, locks: { ...prev.locks, [companyId]: !prev.locks[companyId] } };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  const setAssign = useCallback((programKey: string, username: string) => {
    setState((prev) => {
      const next = { ...prev, assigns: { ...prev.assigns, [programKey]: username } };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  const applyAssigns = useCallback((assigns: AssignMap) => {
    setState((prev) => {
      const next = { ...prev, assigns };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  const setProgramStatus = useCallback((programKey: string, status: ProgramStatus | null) => {
    setState((prev) => {
      const statuses = { ...prev.statuses };
      // null = '자동'으로 되돌리기 — 키를 남겨두면 자동 판정이 영영 안 먹는다
      if (status) statuses[programKey] = status;
      else delete statuses[programKey];
      const next = { ...prev, statuses };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  const isLocked = useCallback((companyId: number) => Boolean(state.locks[companyId]), [state.locks]);

  void persist; // 개별 setter에서 직접 저장 — 남겨두면 향후 일괄 저장에 사용

  return (
    <AdminContext.Provider
      value={{
        locks: state.locks, toggleLock, isLocked,
        assigns: state.assigns, setAssign, applyAssigns,
        statuses: state.statuses, setProgramStatus,
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

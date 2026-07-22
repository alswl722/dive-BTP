"use client";

// 데모용 로그인/권한 컨텍스트.
//
// ⚠️ 계정이 클라이언트 코드에 하드코딩돼 있다 — 브라우저에서 누구나 볼 수 있으므로
//    실 운영 인증이 아니다. 발표 데모에서 "담당자 화면 vs 관리자 화면"을 보여주기 위한
//    역할 전환 장치. 실제 도입 시에는 백엔드 세션/토큰 인증으로 교체해야 한다.
//
// 기존 RoleProvider(담당자/관리자)와 통합 — 로그인한 계정의 role이 곧 화면 권한이 된다.
// CLAUDE.md 원칙4(뷰는 하나, 필터만 다르게)를 유지하되, 관리자 전용 화면(/admin)만 분리.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Role } from "@/lib/roles";

export interface DemoAccount {
  username: string;
  password: string;
  role: Role;
  name: string;
  dept: string;
}

/** 데모 계정 — 발표 시연용. 실 운영에서는 백엔드 인증으로 대체. */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  { username: "121212", password: "121212", role: "담당자", name: "심사 담당자", dept: "기업지원팀" },
  { username: "131313", password: "131313", role: "관리자", name: "전사 관리자", dept: "기업지원팀" },
];

export interface SessionUser {
  username: string;
  role: Role;
  name: string;
  dept: string;
}

interface AuthContextValue {
  user: SessionUser | null;
  /** 세션 복원 전에는 true — 이 동안 화면을 그리면 로그인창이 깜빡인다. */
  loading: boolean;
  login: (username: string, password: string) => { ok: boolean; error?: string };
  logout: () => void;
  /** 프로필(이름·부서) 수정 — 데모용 세션 반영. 계정·역할은 로그인 계정 고정이라 못 바꾼다. */
  updateProfile: (patch: Partial<Pick<SessionUser, "name" | "dept">>) => void;
  /** 비밀번호 변경 — 데모용. 오버라이드를 localStorage에 저장하고 login이 참조한다. */
  changePassword: (current: string, next: string) => { ok: boolean; error?: string };
}

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = "btp.session";
// ⚠️ 데모용 비밀번호 오버라이드(username → password). 실 인증이 아니며 평문 저장이지만,
//    계정·비번이 이미 클라이언트 코드에 하드코딩된 데모 범위와 동일한 수준이다.
const PWD_KEY = "btp.pwd";

function readPwdOverrides(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(PWD_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

/** 계정의 현재 유효 비밀번호(오버라이드 우선, 없으면 기본값). */
function effectivePassword(username: string): string | null {
  const acc = DEMO_ACCOUNTS.find((a) => a.username === username);
  if (!acc) return null;
  return readPwdOverrides()[username] ?? acc.password;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  // 새로고침해도 로그인이 풀리지 않도록 세션 복원.
  // sessionStorage 사용 — 탭을 닫으면 만료되므로 공용 PC에서 세션이 남지 않는다.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setUser(JSON.parse(raw) as SessionUser);
    } catch {
      // 저장값이 깨졌으면 비로그인으로 시작
    }
    setLoading(false);
  }, []);

  const login = useCallback((username: string, password: string) => {
    const found = DEMO_ACCOUNTS.find((a) => a.username === username.trim());
    // 비밀번호는 오버라이드(변경분) 우선, 없으면 기본값
    if (!found || effectivePassword(found.username) !== password) {
      return { ok: false, error: "아이디 또는 비밀번호가 올바르지 않습니다." };
    }
    const session: SessionUser = {
      username: found.username, role: found.role, name: found.name, dept: found.dept,
    };
    setUser(session);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // 저장 실패해도 이번 세션은 동작
    }
    return { ok: true };
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
  }, []);

  const updateProfile = useCallback((patch: Partial<Pick<SessionUser, "name" | "dept">>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  const changePassword = useCallback((current: string, next: string) => {
    if (!user) return { ok: false, error: "로그인이 필요합니다." };
    if (effectivePassword(user.username) !== current) {
      return { ok: false, error: "현재 비밀번호가 일치하지 않습니다." };
    }
    if (next.length < 4) return { ok: false, error: "새 비밀번호는 4자 이상이어야 합니다." };
    if (next === current) return { ok: false, error: "현재 비밀번호와 다르게 설정하세요." };
    try {
      const overrides = readPwdOverrides();
      overrides[user.username] = next;
      localStorage.setItem(PWD_KEY, JSON.stringify(overrides));
    } catch {
      return { ok: false, error: "저장에 실패했습니다." };
    }
    return { ok: true };
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateProfile, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth는 AuthProvider 안에서만 사용");
  return ctx;
}

export function isAdmin(user: SessionUser | null): boolean {
  return user?.role === "관리자";
}

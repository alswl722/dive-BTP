"use client";

// 담당자/관리자 role 컨텍스트. CLAUDE.md 원칙4: 뷰는 하나, 필터만 다르게.
// 목업 단계에선 role에 따라 클라이언트 필터/표기만 바뀐다.
// (실제로는 담당자=소속 부서 사업만, 관리자=전체. 부서 필드가 데이터에 오면 필터 연결.)

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";

export type Role = "담당자" | "관리자";

interface RoleContextValue {
  role: Role;
  setRole: (r: Role) => void;
}

const RoleContext = createContext<RoleContextValue>({ role: "관리자", setRole: () => {} });

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>("담당자");
  const { user } = useAuth();

  // 로그인 계정의 권한을 앱 전역 role로 동기화 — 로그인 이후에는 임의 전환이 아니라
  // 계정이 권한의 단일 출처가 된다(메모 작성자 라벨 등도 이 값을 쓴다).
  useEffect(() => {
    if (user) setRole(user.role);
  }, [user]);

  return <RoleContext.Provider value={{ role, setRole }}>{children}</RoleContext.Provider>;
}

export function useRole() {
  return useContext(RoleContext);
}

/** 메모 작성자 등 저장되는 값에 쓰는 표시 라벨.
 *  진입점마다 role 원본("관리자")과 라벨("전사 관리자")이 섞여 저장되던 문제가 있어
 *  변환을 한 곳으로 모은다 — DB에 남는 값이므로 표기가 갈리면 나중에 못 되돌린다. */
export function authorLabel(role: Role): string {
  return role === "관리자" ? "전사 관리자" : "심사 담당자";
}

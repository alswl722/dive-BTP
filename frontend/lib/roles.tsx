"use client";

// 담당자/관리자 role 컨텍스트. CLAUDE.md 원칙4: 뷰는 하나, 필터만 다르게.
// 목업 단계에선 role에 따라 클라이언트 필터/표기만 바뀐다.
// (실제로는 담당자=소속 부서 사업만, 관리자=전체. 부서 필드가 데이터에 오면 필터 연결.)

import { createContext, useContext, useState, type ReactNode } from "react";

export type Role = "담당자" | "관리자";

interface RoleContextValue {
  role: Role;
  setRole: (r: Role) => void;
}

const RoleContext = createContext<RoleContextValue>({ role: "관리자", setRole: () => {} });

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>("관리자");
  return <RoleContext.Provider value={{ role, setRole }}>{children}</RoleContext.Provider>;
}

export function useRole() {
  return useContext(RoleContext);
}

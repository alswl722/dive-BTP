"use client";

import { useRole } from "@/lib/roles";

export function RoleGreeting() {
  const { role } = useRole();
  return <>{role === "관리자" ? "전사 관리자" : "심사 담당자"}</>;
}

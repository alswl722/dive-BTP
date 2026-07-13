"use client";

import { useRole } from "@/lib/roles";
import { RoleSwitcher } from "./role-switcher";

export function Header() {
  const { role } = useRole();
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-6">
      <div className="text-sm text-muted-foreground">
        {role === "관리자" ? "전사 통합 뷰" : "담당 부서 뷰"}
        <span className="ml-2 text-xs">· 샘플 데이터(11개 기업)</span>
      </div>
      <RoleSwitcher />
    </header>
  );
}

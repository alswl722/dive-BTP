"use client";

import { useRole, type Role } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { UserCog } from "lucide-react";

const ROLES: Role[] = ["담당자", "관리자"];

export function RoleSwitcher() {
  const { role, setRole } = useRole();
  return (
    <div className="flex items-center gap-2">
      <UserCog className="h-4 w-4 text-muted-foreground" />
      <div className="inline-flex rounded-lg bg-muted p-0.5">
        {ROLES.map((r) => (
          <button
            key={r}
            onClick={() => setRole(r)}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              role === r ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}

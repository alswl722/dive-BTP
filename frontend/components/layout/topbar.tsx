"use client";

import { useState, type FormEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, Table2, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUi } from "@/lib/app-state";

export function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { viewMode, setViewMode } = useUi();
  const [q, setQ] = useState("");
  const onSelectionScreen = pathname.startsWith("/companies");

  function onSearch(e: FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    router.push(`/companies?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <header className="flex h-[52px] shrink-0 items-center justify-between gap-4 border-b bg-card px-6">
      <form onSubmit={onSearch} className="relative w-full max-w-2xl">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="기업명, 사업자번호, 업종으로 검색..."
          className="w-full rounded-lg border bg-subtle py-2 pl-10 pr-3 text-[13px] outline-none focus:ring-2 focus:ring-ring/40"
        />
      </form>

      {onSelectionScreen && (
        <div className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-muted p-0.5">
          <ViewToggleButton active={viewMode === "table"} onClick={() => setViewMode("table")} icon={Table2} label="목록" />
          <ViewToggleButton active={viewMode === "board"} onClick={() => setViewMode("board")} icon={LayoutGrid} label="보드" />
        </div>
      )}
    </header>
  );
}

function ViewToggleButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Table2;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "flex items-center gap-1.5 rounded px-2.5 py-1 text-[12px] font-medium transition-colors",
        active ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

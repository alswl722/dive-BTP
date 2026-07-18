"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const GROUP_SIZE = 5;

/** 페이지 번호를 5개씩 묶어서 보여주고, 그룹 단위로 이전/다음 이동. */
export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null;

  const groupStart = Math.floor(page / GROUP_SIZE) * GROUP_SIZE;
  const groupEnd = Math.min(groupStart + GROUP_SIZE, totalPages);
  const pages = Array.from({ length: groupEnd - groupStart }, (_, i) => groupStart + i);

  return (
    <div className="flex items-center justify-center gap-1.5">
      <button
        onClick={() => onChange(groupStart - 1)}
        disabled={groupStart === 0}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      {pages.map((i) => (
        <button
          key={i}
          onClick={() => onChange(i)}
          className={cn(
            "h-7 min-w-7 rounded-md px-2 text-[12px] font-medium",
            i === page ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          )}
        >
          {i + 1}
        </button>
      ))}
      <button
        onClick={() => onChange(groupEnd)}
        disabled={groupEnd >= totalPages}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

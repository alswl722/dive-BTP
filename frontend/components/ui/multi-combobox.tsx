"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MultiComboboxOption {
  value: string;
  label: string;
}

/** 여러 개 고를 수 있는 드롭다운 — 칩 그룹 대신 쓰는 다중선택 버전.
 *  선택된 항목 수만 버튼에 배지로 표시하고, 목록은 검색 가능한 팝오버로 연다. */
export function MultiCombobox({
  options,
  values,
  onChange,
  placeholder,
  className,
}: {
  options: MultiComboboxOption[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // 바깥 클릭 시 닫기 — 모달 안에 중첩돼도 확실히 동작하도록 document 리스너로 처리
  // (fixed 백드롭은 중첩 스택 컨텍스트에서 클릭이 안 잡히는 경우가 있다).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  function toggle(value: string) {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-left text-[12.5px] font-medium",
          values.length > 0 ? "border-primary text-primary" : "text-foreground hover:bg-muted"
        )}
      >
        <span className="whitespace-nowrap">{placeholder}</span>
        {values.length > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {values.length}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <>
          <div className="absolute left-0 top-full z-20 mt-1.5 w-[260px] overflow-hidden rounded-lg border bg-card shadow-modal">
            <div className="relative border-b p-2">
              <Search className="pointer-events-none absolute left-4.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                // Esc는 콤보박스만 닫고 상위 모달로 전파하지 않는다
                onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } }}
                placeholder="검색..."
                className="w-full rounded-md bg-subtle py-1.5 pl-8 pr-2 text-[12.5px] outline-none"
              />
            </div>
            <div className="max-h-[280px] overflow-y-auto p-1">
              {filtered.length === 0 && (
                <p className="px-3 py-4 text-center text-[12px] text-muted-foreground">검색 결과가 없습니다.</p>
              )}
              {filtered.map((o) => {
                const checked = values.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggle(o.value)}
                    title={o.label}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] hover:bg-muted",
                      checked && "bg-info-bg text-info"
                    )}
                  >
                    <Check className={cn("h-3.5 w-3.5 shrink-0", checked ? "opacity-100" : "opacity-0")} />
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  </button>
                );
              })}
            </div>
            {values.length > 0 && (
              <div className="border-t p-1.5">
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="w-full rounded-md px-2.5 py-1 text-center text-[11.5px] text-primary hover:bg-muted"
                >
                  선택 해제
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

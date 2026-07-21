"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  group?: string; // 옵션이 많을 때(예: 연도별) 헤더로 묶어서 표시
}

/** 검색 가능한 단일 선택 콤보박스 — 항목이 많은 <select>(사업 선택 등) 대체용.
 *  버튼을 누르면 검색창+스크롤 목록이 뜨고, 타이핑하면 라벨 기준으로 좁혀진다. */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "선택",
  className,
}: {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // 그룹 헤더 순서를 유지한 채 그룹별로 묶는다(정렬은 호출부 책임)
  const groups = useMemo(() => {
    const map = new Map<string, ComboboxOption[]>();
    for (const o of filtered) {
      const key = o.group ?? "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md border bg-subtle px-2.5 py-1.5 text-left text-[12.5px] outline-none focus:ring-2 focus:ring-ring/40"
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1.5 w-[340px] max-w-[90vw] overflow-hidden rounded-lg bg-card shadow-modal">
            <div className="relative border-b p-2">
              <Search className="pointer-events-none absolute left-4.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="검색..."
                className="w-full rounded-md bg-subtle py-1.5 pl-8 pr-2 text-[12.5px] outline-none"
              />
            </div>
            <div className="max-h-[280px] overflow-y-auto p-1">
              {filtered.length === 0 && (
                <p className="px-3 py-4 text-center text-[12px] text-muted-foreground">검색 결과가 없습니다.</p>
              )}
              {groups.map(([group, items]) => (
                <div key={group}>
                  {group && (
                    <p className="px-2.5 pb-1 pt-2 text-[10.5px] font-medium text-muted-foreground">{group}</p>
                  )}
                  {items.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => {
                        onChange(o.value);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] hover:bg-muted",
                        o.value === value && "bg-info-bg text-info"
                      )}
                    >
                      <Check className={cn("h-3.5 w-3.5 shrink-0", o.value === value ? "opacity-100" : "opacity-0")} />
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

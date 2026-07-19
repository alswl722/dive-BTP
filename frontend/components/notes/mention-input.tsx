"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Company, Program } from "@/types";
import { buildMention, type MentionRef } from "@/lib/notes";
import { cn } from "@/lib/utils";

interface Candidate {
  key: string;
  label: string;
  sub: string;
  ref: MentionRef;
}

const MAX_SUGGESTIONS = 8;

/** 커서 바로 앞의 미완성 멘션 토큰을 찾는다.
 *  "@기업 10" → {sigil:"@", query:"기업 10", start:n}
 *  공백 두 번이 들어가면 멘션 의도가 아니라고 보고 종료(문장 중 @ 오타 방지). */
function activeToken(value: string, caret: number): { sigil: "@" | "#"; query: string; start: number } | null {
  const upto = value.slice(0, caret);
  const at = Math.max(upto.lastIndexOf("@"), upto.lastIndexOf("#"));
  if (at < 0) return null;
  const sigil = upto[at] as "@" | "#";
  const query = upto.slice(at + 1);
  if (query.includes("\n") || (query.match(/ /g)?.length ?? 0) >= 2) return null;
  if (query.includes("]") || query.includes(")")) return null; // 이미 완성된 멘션 뒤
  return { sigil, query, start: at };
}

export function MentionInput({
  value,
  onChange,
  companies,
  programs,
  placeholder,
  rows = 3,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  companies: Company[];
  programs: Program[];
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState<{ sigil: "@" | "#"; query: string; start: number } | null>(null);
  const [highlight, setHighlight] = useState(0);

  const candidates = useMemo<Candidate[]>(() => {
    if (!active) return [];
    const q = active.query.trim().toLowerCase();
    if (active.sigil === "@") {
      return companies
        .filter((c) => !q || `${c.name} ${c.industry ?? ""}`.toLowerCase().includes(q))
        .slice(0, MAX_SUGGESTIONS)
        .map((c) => ({
          key: `c${c.id}`,
          label: c.name,
          sub: c.industry ?? "업종 미상",
          ref: { kind: "company", id: c.id } as MentionRef,
        }));
    }
    // 사업은 757건이라 검색어 없이 전부 띄우면 고를 수 없다 — 최근 연도 우선.
    return programs
      .filter((p) => !q || `${p.name ?? ""} ${p.programCode}`.toLowerCase().includes(q))
      .sort((a, b) => b.year - a.year)
      .slice(0, MAX_SUGGESTIONS)
      .map((p) => ({
        key: `p${p.year}:${p.programCode}`,
        label: p.name ?? p.programCode,
        sub: `${p.year}년 · ${p.businessType ?? "미분류"}`,
        ref: { kind: "program", year: p.year, code: p.programCode } as MentionRef,
      }));
  }, [active, companies, programs]);

  useEffect(() => setHighlight(0), [active?.query, active?.sigil]);

  function syncCaret(el: HTMLTextAreaElement) {
    const pos = el.selectionStart ?? 0;
    setCaret(pos);
    setActive(activeToken(el.value, pos));
  }

  function pick(c: Candidate) {
    if (!active) return;
    const before = value.slice(0, active.start);
    const after = value.slice(caret);
    const inserted = buildMention(c.label, c.ref) + " ";
    const next = before + inserted + after;
    onChange(next);
    setActive(null);
    // 삽입 지점 뒤로 커서를 옮긴다(브라우저가 값 갱신 후 처리하도록 다음 프레임에).
    const pos = before.length + inserted.length;
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!active || candidates.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % candidates.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + candidates.length) % candidates.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pick(candidates[highlight]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setActive(null);
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        autoFocus={autoFocus}
        placeholder={placeholder ?? "메모를 입력하세요. @로 기업, #으로 사업을 언급할 수 있습니다."}
        onChange={(e) => {
          onChange(e.target.value);
          syncCaret(e.target);
        }}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => syncCaret(e.currentTarget)}
        onClick={(e) => syncCaret(e.currentTarget)}
        onBlur={() => setTimeout(() => setActive(null), 120)} // 항목 클릭이 먼저 처리되도록
        className="w-full resize-y rounded-lg border bg-card p-3 text-[13px] leading-relaxed outline-none focus:ring-2 focus:ring-ring/40"
      />

      {active && candidates.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-2 right-2 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border bg-card py-1 shadow-modal"
        >
          <li className="px-3 pb-1 text-[10.5px] text-muted-foreground">
            {active.sigil === "@" ? "기업" : "지원사업"} · ↑↓ 이동 · Enter 선택
          </li>
          {candidates.map((c, i) => (
            <li key={c.key}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()} // blur보다 먼저 클릭이 먹도록
                onClick={() => pick(c)}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  "flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left",
                  i === highlight ? "bg-muted" : "hover:bg-muted"
                )}
              >
                <span className="min-w-0 truncate text-[12.5px] font-medium">{c.label}</span>
                <span className="shrink-0 truncate text-[11px] text-muted-foreground">{c.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink, NotebookPen } from "lucide-react";
import { createNote, notesPersisted } from "@/lib/api";
import { buildMention } from "@/lib/notes";
import { useRole } from "@/lib/roles";
import type { Company } from "@/types";

/**
 * 스코어카드에서 바로 메모 남기기.
 *
 * 심사 상태(선정/보류/제외)는 지정할 수 있는데 "왜 그렇게 판단했는지"를 남길 곳이
 * 별도 페이지(/notes)에 있어 워크플로우가 끊겼다. 여기서 작성하면 기업 멘션이
 * 자동으로 붙어 메모 페이지에서도 이 기업으로 연결된다.
 */
export function NoteComposer({ company }: { company: Company }) {
  const { role } = useRole();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mention = buildMention(company.name, { kind: "company", id: company.id });

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    try {
      // 본문 앞에 기업 멘션을 붙여 메모 페이지에서 양방향 연결되게 한다.
      await createNote(`${mention} ${trimmed}`, role);
      setText("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <NotebookPen className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-[12.5px] font-bold">심사 메모</p>
        </div>
        <Link
          href="/notes"
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          전체 메모 <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {!notesPersisted ? (
        <p className="rounded-lg bg-muted/40 px-3 py-2.5 text-[11.5px] text-muted-foreground">
          현재 fixture 모드라 메모를 저장할 수 없습니다. 백엔드 연결 시 사용할 수 있습니다.
        </p>
      ) : (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
            rows={2}
            placeholder={`이 기업에 대한 판단 근거를 남기세요 (⌘/Ctrl+Enter 저장)`}
            className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-[12.5px] outline-none placeholder:text-muted-foreground focus:border-primary"
          />
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {saved ? "저장됨" : error ?? `${company.name} 자동 연결`}
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={!text.trim() || saving}
              className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground disabled:opacity-40"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

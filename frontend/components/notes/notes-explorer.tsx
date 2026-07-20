"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Pencil, Search, Trash2, X } from "lucide-react";
import type { Company, Note, Program } from "@/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MentionInput } from "@/components/notes/mention-input";
import { NoteBody } from "@/components/notes/note-body";
import { createNote, deleteNote, notesPersisted, updateNote } from "@/lib/api";
import { plainText, relativeTime } from "@/lib/notes";
import { authorLabel, useRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

/** 서버 저장 실패 시에도 화면에는 남기기 위한 임시 id(음수로 실제 id와 구분). */
let tempId = -1;

export function NotesExplorer({
  initialNotes,
  companies,
  programs,
}: {
  initialNotes: Note[];
  companies: Company[];
  programs: Program[];
}) {
  const { role } = useRole();
  const author = authorLabel(role);

  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return notes;
    return notes.filter(
      (n) => plainText(n.body).toLowerCase().includes(needle) || n.author.toLowerCase().includes(needle)
    );
  }, [notes, q]);

  async function submit() {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    const optimistic: Note = {
      id: tempId--,
      body,
      author,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      mentions: [],
    };
    setNotes((prev) => [optimistic, ...prev]);
    try {
      const saved = await createNote(body, author);
      if (saved) setNotes((prev) => prev.map((n) => (n.id === optimistic.id ? saved : n)));
    } catch (err) {
      console.error("메모 저장 실패:", err);
    }
  }

  async function saveEdit(id: number) {
    const body = editBody.trim();
    if (!body) return;
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, body, updatedAt: new Date().toISOString() } : n)));
    setEditingId(null);
    try {
      const saved = await updateNote(id, body);
      if (saved) setNotes((prev) => prev.map((n) => (n.id === id ? saved : n)));
    } catch (err) {
      console.error("메모 수정 실패:", err);
    }
  }

  async function remove(id: number) {
    const prev = notes;
    setNotes((cur) => cur.filter((n) => n.id !== id));
    try {
      await deleteNote(id);
    } catch (err) {
      console.error("메모 삭제 실패, 되돌림:", err);
      setNotes(prev);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h1 className="text-xl font-bold">메모</h1>
          <p className="text-sm text-muted-foreground">
            심사 중 기록 {notes.length}건 · <span className="text-muted-foreground">@기업 · #사업으로 연결</span>
          </p>
        </div>
        <div className="relative w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="메모 검색"
            aria-label="메모 검색"
            className="w-full rounded-md border bg-subtle py-1.5 pl-8 pr-7 text-[12px] outline-none focus:ring-2 focus:ring-ring/40"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              aria-label="검색어 지우기"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {!notesPersisted && (
        <div className="flex items-start gap-2 rounded-lg bg-warn-bg px-3 py-2.5 text-[12px] text-[hsl(30_75%_38%)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>DB 미연결 상태입니다 — 작성한 메모는 화면에만 표시되고 새로고침하면 사라집니다.</p>
        </div>
      )}

      <Card className="space-y-2 p-3">
        <MentionInput value={draft} onChange={setDraft} companies={companies} programs={programs} />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">작성자: {author}</span>
          <button
            onClick={submit}
            disabled={!draft.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground disabled:opacity-40"
          >
            메모 남기기
          </button>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <p className="rounded-xl bg-subtle p-8 text-center text-sm text-muted-foreground">
          {notes.length === 0 ? "아직 메모가 없습니다. 심사하며 떠오른 판단을 남겨보세요." : "검색 결과가 없습니다."}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => (
            <Card key={n.id} className="group p-3.5">
              <div className="mb-1.5 flex items-center gap-2">
                <Badge variant="secondary" className="text-[10.5px]">{n.author}</Badge>
                <span className="text-[11px] text-muted-foreground">{relativeTime(n.createdAt)}</span>
                {n.updatedAt !== n.createdAt && (
                  <span className="text-[10.5px] text-muted-foreground">(수정됨)</span>
                )}
                <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => { setEditingId(n.id); setEditBody(n.body); }}
                    aria-label="메모 수정"
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => remove(n.id)}
                    aria-label="메모 삭제"
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-bad"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {editingId === n.id ? (
                <div className="space-y-2">
                  <MentionInput value={editBody} onChange={setEditBody} companies={companies} programs={programs} autoFocus />
                  <div className="flex justify-end gap-1.5">
                    <button
                      onClick={() => setEditingId(null)}
                      className="rounded-md border px-2.5 py-1 text-[12px] hover:bg-muted"
                    >
                      취소
                    </button>
                    <button
                      onClick={() => saveEdit(n.id)}
                      className="rounded-md bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground"
                    >
                      저장
                    </button>
                  </div>
                </div>
              ) : (
                <NoteBody body={n.body} />
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/** 기업·사업 상세에서 쓰는 역방향 목록 — "이 대상이 언급된 메모". */
export function MentionedNotes({ notes, emptyText }: { notes: Note[]; emptyText: string }) {
  if (notes.length === 0) {
    return <p className={cn("rounded-lg bg-subtle p-3 text-[11.5px] text-muted-foreground")}>{emptyText}</p>;
  }
  return (
    <div className="space-y-1.5">
      {notes.map((n) => (
        <div key={n.id} className="rounded-lg bg-subtle p-2.5">
          <div className="mb-1 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
            <span className="font-medium">{n.author}</span>
            <span>·</span>
            <span>{relativeTime(n.createdAt)}</span>
          </div>
          <NoteBody body={n.body} className="whitespace-pre-wrap text-[12px] leading-relaxed" />
        </div>
      ))}
    </div>
  );
}

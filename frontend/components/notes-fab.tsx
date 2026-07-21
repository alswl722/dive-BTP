"use client";

// 메모 FAB — 챗봇 FAB처럼 우측 하단에서 펼쳐, 보던 페이지를 유지한 채 메모를 남긴다.
//   전체 목록·검색·수정은 /notes 페이지에 남기고, 여기선 "빠르게 쓰고 최근 것 확인"에 집중.
//   전역 마운트(auth-gate)라 companies/programs/notes를 첫 펼침 때 클라이언트에서 로드.
import { useRef, useState } from "react";
import { NotebookPen, X } from "lucide-react";
import type { Note } from "@/types";
import { createNote, notesPersisted } from "@/lib/api";
import { relativeTime } from "@/lib/notes";
import { useNotesData } from "@/lib/notes-data";
import { useFabState } from "@/lib/fab-state";
import { authorLabel, useRole } from "@/lib/roles";
import { MentionInput } from "@/components/notes/mention-input";
import { NoteBody } from "@/components/notes/note-body";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

let tempId = -1;

export function NotesFab() {
  const { role } = useRole();
  const author = authorLabel(role);
  const { companies, programs, initialNotes } = useNotesData();
  const { chatbotOpen } = useFabState();

  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [draft, setDraft] = useState("");

  // 드래그로 패널 위치 조절. 아직 안 옮겼으면(dx=dy=0) 챗봇 열림 시 자동으로 살짝 왼쪽으로 비켜서고,
  // 한 번 옮기면 그 위치를 유지한다(사용자 배치 우선).
  const [drag, setDrag] = useState({ dx: 0, dy: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; baseDx: number; baseDy: number } | null>(null);

  function onDragStart(e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseDx: drag.dx, baseDy: drag.dy };
    setDragging(true);
    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      setDrag({ dx: d.baseDx + (ev.clientX - d.startX), dy: d.baseDy + (ev.clientY - d.startY) });
    };
    const onUp = () => {
      dragRef.current = null;
      setDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.userSelect = "none";
  }

  const moved = drag.dx !== 0 || drag.dy !== 0;
  // 안 옮겼고 챗봇이 열렸으면 챗봇 패널 바로 왼쪽(8px 간격)으로 비켜선다. 옮겼으면 드래그 위치 그대로.
  const shiftX = !moved && chatbotOpen ? -356 : 0;

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
      if (saved) setNotes((prev) => prev.map((x) => (x.id === optimistic.id ? saved : x)));
    } catch (err) {
      console.error("메모 저장 실패:", err);
    }
  }

  return (
    <div className="fixed bottom-6 right-24 z-50 flex flex-col items-end gap-3">
      {open && (
        <div
          className={cn(
            "flex h-[520px] w-[380px] flex-col overflow-hidden rounded-xl bg-card shadow-modal",
            !dragging && "transition-transform duration-200",
          )}
          style={{ transform: `translate(${drag.dx + shiftX}px, ${drag.dy}px)` }}
        >
          <div
            onMouseDown={onDragStart}
            className="flex h-12 shrink-0 cursor-move select-none items-center justify-between bg-sidebar px-4"
          >
            <span className="flex items-center gap-1.5 text-[13px] font-bold text-sidebar-foreground">
              <NotebookPen className="h-4 w-4" /> 메모
            </span>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setOpen(false)}
              aria-label="닫기"
              className="text-sidebar-foreground hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* 작성란 */}
          <div className="shrink-0 space-y-2 border-b p-3">
            {!notesPersisted && (
              <p className="rounded-md bg-warn-bg px-2.5 py-1.5 text-[11px] text-[hsl(30_75%_38%)]">
                DB 미연결 — 메모는 화면에만 표시되고 새로고침하면 사라집니다.
              </p>
            )}
            <MentionInput value={draft} onChange={setDraft} companies={companies} programs={programs} />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">@기업 · #사업으로 연결 · {author}</span>
              <button
                onClick={submit}
                disabled={!draft.trim()}
                className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground disabled:opacity-40"
              >
                메모 남기기
              </button>
            </div>
          </div>

          {/* 최근 메모 목록 */}
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {notes.length === 0 ? (
              <p className="rounded-lg bg-subtle p-6 text-center text-[12px] text-muted-foreground">
                아직 메모가 없습니다. 떠오른 판단을 남겨보세요.
              </p>
            ) : (
              notes.map((n) => (
                <div key={n.id} className="rounded-lg border p-2.5">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">{n.author}</Badge>
                    <span className="text-[10.5px] text-muted-foreground">{relativeTime(n.createdAt)}</span>
                    {n.updatedAt !== n.createdAt && (
                      <span className="text-[10px] text-muted-foreground">(수정됨)</span>
                    )}
                  </div>
                  <NoteBody body={n.body} className="text-[12px]" />
                </div>
              ))
            )}
          </div>

          <div className="shrink-0 border-t px-3 py-2 text-center">
            <a href="/notes" className="text-[11px] text-primary hover:underline">
              전체 메모 보기 →
            </a>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "메모 닫기" : "메모 열기"}
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full shadow-modal transition-transform hover:scale-105",
          open ? "bg-sidebar text-white" : "bg-card text-foreground ring-1 ring-border",
        )}
      >
        {open ? <X className="h-5 w-5" /> : <NotebookPen className="h-5 w-5" />}
      </button>
    </div>
  );
}

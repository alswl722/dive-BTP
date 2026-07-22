"use client";

// 메모 공유 저장소 — FAB(전역)·/notes 페이지·프로필이 같은 메모를 본다.
//
// 배경: 이전에는 두 메모 UI가 각자 useState(initialNotes)를 들고 있어 서로 공유되지
// 않았고, 백엔드 미연동(fixture) 시에는 새로고침·이동하면 세션 메모가 사라졌다.
// 여기서 단일 소스로 모으고, fixture 모드에선 localStorage에 영속화한다(다른 탭 동기화).
// 백엔드가 붙으면(notesPersisted) 서버가 소스이고 이 저장소는 낙관적 캐시로만 쓴다.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Note } from "@/types";
import { createNote as apiCreate, updateNote as apiUpdate, deleteNote as apiDelete, notesPersisted } from "@/lib/api";

const KEY = "btp.notes.local";
let tempId = -1;

interface NotesStoreValue {
  notes: Note[];
  create: (body: string, author: string) => Promise<void>;
  saveEdit: (id: number, body: string) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

const NotesStoreContext = createContext<NotesStoreValue | null>(null);

export function NotesStoreProvider({ initial, children }: { initial: Note[]; children: ReactNode }) {
  const [notes, setNotes] = useState<Note[]>(initial);

  useEffect(() => {
    if (notesPersisted) return; // 백엔드가 소스면 로컬 복원 안 함
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setNotes(JSON.parse(raw) as Note[]);
    } catch {
      /* 깨진 값이면 initial 유지 */
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      try {
        setNotes(e.newValue ? (JSON.parse(e.newValue) as Note[]) : []);
      } catch {
        /* noop */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const writeLocal = (next: Note[]) => {
    if (!notesPersisted) {
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* noop */
      }
    }
  };

  const create = useCallback(
    async (body: string, author: string) => {
      const now = new Date().toISOString();
      const optimistic: Note = { id: tempId--, body, author, createdAt: now, updatedAt: now, mentions: [] };
      const next = [optimistic, ...notes];
      setNotes(next);
      writeLocal(next);
      if (notesPersisted) {
        try {
          const saved = await apiCreate(body, author);
          if (saved) setNotes((prev) => prev.map((n) => (n.id === optimistic.id ? saved : n)));
        } catch (err) {
          console.error("메모 저장 실패:", err);
        }
      }
    },
    [notes]
  );

  const saveEdit = useCallback(
    async (id: number, body: string) => {
      const next = notes.map((n) => (n.id === id ? { ...n, body, updatedAt: new Date().toISOString() } : n));
      setNotes(next);
      writeLocal(next);
      if (notesPersisted) {
        try {
          const saved = await apiUpdate(id, body);
          if (saved) setNotes((prev) => prev.map((n) => (n.id === id ? saved : n)));
        } catch (err) {
          console.error("메모 수정 실패:", err);
        }
      }
    },
    [notes]
  );

  const remove = useCallback(
    async (id: number) => {
      const snapshot = notes;
      const next = notes.filter((n) => n.id !== id);
      setNotes(next);
      writeLocal(next);
      if (notesPersisted) {
        try {
          await apiDelete(id);
        } catch (err) {
          console.error("메모 삭제 실패, 되돌림:", err);
          setNotes(snapshot);
        }
      }
    },
    [notes]
  );

  return <NotesStoreContext.Provider value={{ notes, create, saveEdit, remove }}>{children}</NotesStoreContext.Provider>;
}

export function useNotesStore() {
  const ctx = useContext(NotesStoreContext);
  if (!ctx) throw new Error("useNotesStore는 NotesStoreProvider 안에서만 사용");
  return ctx;
}

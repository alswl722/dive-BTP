"use client";

// 메모 FAB용 초기 데이터 컨텍스트.
// NotesFab은 전역(auth-gate) 클라이언트 컴포넌트라 브라우저에서 직접 백엔드(docker
// 내부 호스트명)를 못 부른다 — RootLayout(서버)이 받아 여기로 내려준다. 저장은
// createNote(/api/notes 프록시)가 클라이언트에서 처리하므로 여기선 초기 로드만 담당.
import { createContext, useContext, type ReactNode } from "react";
import type { Company, Note, Program } from "@/types";

interface NotesData {
  companies: Company[];
  programs: Program[];
  initialNotes: Note[];
}

const NotesDataContext = createContext<NotesData>({ companies: [], programs: [], initialNotes: [] });

export function NotesDataProvider({ value, children }: { value: NotesData; children: ReactNode }) {
  return <NotesDataContext.Provider value={value}>{children}</NotesDataContext.Provider>;
}

export const useNotesData = () => useContext(NotesDataContext);

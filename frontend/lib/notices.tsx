"use client";

// 공지사항 — 관리자가 작성하고 심사 담당자가 읽는다.
//
// ⚠️ 현재는 sessionStorage 기반이다(백엔드 미연동). 탭을 닫으면 초기값으로 돌아가고
//    다른 사용자와 공유되지 않는다. 실 운영에서는 notes처럼 API로 영속화해야 하며,
//    그때 이 훅의 setter만 API 호출로 바꾸면 화면은 그대로 동작한다.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export interface Notice {
  id: number;
  title: string;
  body: string;
  author: string;
  createdAt: string; // ISO
  /** 상단 고정 — 마감·필독 공지를 목록 맨 위에 둔다 */
  pinned: boolean;
}

interface NoticeContextValue {
  notices: Notice[];
  /** 고정 공지 우선, 그다음 최신순 */
  sorted: Notice[];
  create: (input: { title: string; body: string; author: string; pinned: boolean }) => void;
  update: (id: number, patch: Partial<Pick<Notice, "title" | "body" | "pinned">>) => void;
  remove: (id: number) => void;
}

const NoticeContext = createContext<NoticeContextValue | null>(null);
const KEY = "btp.notices";

/** 초기 공지 — 빈 화면을 피하고 형식을 보여주기 위한 시드(관리자가 삭제 가능). */
const SEED: Notice[] = [
  {
    id: 1,
    title: "2024년도 하반기 기업지원사업 심사 일정 안내",
    body:
      "하반기 지원사업 심사가 시작됩니다. 담당 사업의 신청 기업을 확인하시고 기한 내 검토를 완료해 주세요.\n" +
      "심사 결과는 기업 상세 화면에서 선정/보류/제외로 지정하고, 판단 근거는 메모로 남겨 주시기 바랍니다.",
    author: "전사 관리자",
    createdAt: "2026-07-15T09:00:00.000Z",
    pinned: true,
  },
  {
    id: 2,
    title: "중복수혜 확인 절차 강화 안내",
    body:
      "동일 기업이 서로 다른 부서 사업을 동시에 수행하는 사례가 확인되고 있습니다.\n" +
      "심사 시 기업 상세의 '지원이력' 탭에서 동시 수행 지원 여부를 반드시 확인해 주세요.",
    author: "전사 관리자",
    createdAt: "2026-07-10T02:30:00.000Z",
    pinned: false,
  },
];

export function NoticeProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>(SEED);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) setNotices(JSON.parse(raw) as Notice[]);
    } catch {
      /* 저장값이 깨졌으면 시드 유지 */
    }
  }, []);

  const persist = useCallback((next: Notice[]) => {
    setNotices(next);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* 저장 실패해도 이번 세션은 동작 */
    }
  }, []);

  const create = useCallback(
    (input: { title: string; body: string; author: string; pinned: boolean }) => {
      setNotices((prev) => {
        const next = [
          {
            id: prev.length ? Math.max(...prev.map((n) => n.id)) + 1 : 1,
            title: input.title.trim(),
            body: input.body.trim(),
            author: input.author,
            createdAt: new Date().toISOString(),
            pinned: input.pinned,
          },
          ...prev,
        ];
        try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* noop */ }
        return next;
      });
    },
    []
  );

  const update = useCallback((id: number, patch: Partial<Pick<Notice, "title" | "body" | "pinned">>) => {
    setNotices((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, ...patch } : n));
      try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  const remove = useCallback((id: number) => {
    setNotices((prev) => {
      const next = prev.filter((n) => n.id !== id);
      try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  void persist; // 개별 setter가 직접 저장 — 향후 일괄 저장 시 사용

  const sorted = [...notices].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt)
  );

  return (
    <NoticeContext.Provider value={{ notices, sorted, create, update, remove }}>
      {children}
    </NoticeContext.Provider>
  );
}

export function useNotices() {
  const ctx = useContext(NoticeContext);
  if (!ctx) throw new Error("useNotices는 NoticeProvider 안에서만 사용");
  return ctx;
}

/** 목록 표시용 날짜 (YYYY-MM-DD). */
export function noticeDate(iso: string): string {
  return iso.slice(0, 10);
}

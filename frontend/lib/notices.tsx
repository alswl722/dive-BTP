"use client";

// 공지사항 — 관리자가 작성하고 심사 담당자가 읽는다.
//
// ⚠️ 현재는 localStorage 기반이다(백엔드 미연동). 공지는 관리자가 쓰고 심사자가 읽는
//    공유 데이터라 탭 단위로 격리되는 sessionStorage를 쓰면 안 된다.
//    다른 사용자와 공유되지 않는다. 실 운영에서는 notes처럼 API로 영속화해야 하며,
//    그때 이 훅의 setter만 API 호출로 바꾸면 화면은 그대로 동작한다.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * 첨부파일. 백엔드가 없어 파일 본문을 data URL로 들고 있다.
 * localStorage 한도(브라우저 공통 약 5MB)를 파일 하나가 다 먹으면 공지·배정까지
 * 같이 못 쓰게 되므로 용량 상한을 두고, 저장 실패는 반드시 화면에 알린다.
 * 실 운영에서는 파일을 서버에 올리고 여기에는 URL만 남긴다.
 */
export interface NoticeAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl: string;
}

/** 파일 1개 상한 */
export const MAX_ATTACHMENT_BYTES = 1024 * 1024;
/** 공지 1건의 첨부 합계 상한 (base64는 원본보다 약 33% 커진다) */
export const MAX_ATTACHMENT_TOTAL_BYTES = 3 * 1024 * 1024;

export interface Notice {
  id: number;
  title: string;
  body: string;
  author: string;
  createdAt: string; // ISO
  /** 상단 고정 — 마감·필독 공지를 목록 맨 위에 둔다 */
  pinned: boolean;
  /** 이전 버전 저장값에는 없다 — 읽는 쪽에서 항상 `?? []` 처리 */
  attachments?: NoticeAttachment[];
}

/** 저장 결과 — 용량 초과로 실패할 수 있어 호출측이 반드시 확인해야 한다. */
export type SaveResult = { ok: true } | { ok: false; error: string };

interface NoticeContextValue {
  notices: Notice[];
  /** 고정 공지 우선, 그다음 최신순 */
  sorted: Notice[];
  create: (input: {
    title: string;
    body: string;
    author: string;
    pinned: boolean;
    attachments?: NoticeAttachment[];
  }) => SaveResult;
  update: (
    id: number,
    patch: Partial<Pick<Notice, "title" | "body" | "pinned" | "attachments">>
  ) => SaveResult;
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
      "심사 결과는 기업 상세 화면에서 선정/제외로 지정하고, 판단 근거는 메모로 남겨 주시기 바랍니다.",
    author: "전사 관리자",
    createdAt: "2026-07-15T09:00:00.000Z",
    pinned: true,
  },
  {
    id: 2,
    title: "중복수혜 확인 절차 강화 안내",
    body:
      "동일 기업이 서로 다른 부서 사업을 동시에 수행하는 사례가 확인되고 있습니다.\n" +
      "심사 시 기업 상세의 '중복수혜' 탭에서 동시 수행 지원 여부를 반드시 확인해 주세요.",
    author: "전사 관리자",
    createdAt: "2026-07-10T02:30:00.000Z",
    pinned: false,
  },
];

const QUOTA_MESSAGE =
  "브라우저 저장 공간이 부족해 저장하지 못했습니다. 첨부파일 크기를 줄이거나 지난 공지를 삭제해 주세요.";

export function NoticeProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>(SEED);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setNotices(JSON.parse(raw) as Notice[]);
    } catch {
      /* 저장값이 깨졌으면 시드 유지 */
    }
  }, []);

  // 저장 성공 여부를 돌려준다 — 실패를 삼키면 사용자는 공지가 등록된 줄 알고 떠난다
  const write = useCallback((next: Notice[]): boolean => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      return true;
    } catch {
      return false;
    }
  }, []);

  const create = useCallback(
    (input: {
      title: string;
      body: string;
      author: string;
      pinned: boolean;
      attachments?: NoticeAttachment[];
    }): SaveResult => {
      const next = [
        {
          id: notices.length ? Math.max(...notices.map((n) => n.id)) + 1 : 1,
          title: input.title.trim(),
          body: input.body.trim(),
          author: input.author,
          createdAt: new Date().toISOString(),
          pinned: input.pinned,
          attachments: input.attachments ?? [],
        },
        ...notices,
      ];
      if (!write(next)) return { ok: false, error: QUOTA_MESSAGE };
      setNotices(next);
      return { ok: true };
    },
    [notices, write]
  );

  const update = useCallback(
    (
      id: number,
      patch: Partial<Pick<Notice, "title" | "body" | "pinned" | "attachments">>
    ): SaveResult => {
      const next = notices.map((n) => (n.id === id ? { ...n, ...patch } : n));
      if (!write(next)) return { ok: false, error: QUOTA_MESSAGE };
      setNotices(next);
      return { ok: true };
    },
    [notices, write]
  );

  const remove = useCallback(
    (id: number) => {
      const next = notices.filter((n) => n.id !== id);
      // 삭제는 저장값이 줄어들기만 하므로 용량 실패를 따로 다루지 않는다
      write(next);
      setNotices(next);
    },
    [notices, write]
  );

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

/** 첨부 용량 표기 (1.4 MB / 220 KB). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

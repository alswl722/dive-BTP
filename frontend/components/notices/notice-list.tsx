"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Inbox, Megaphone, Pin, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useNotices, noticeDate, type Notice } from "@/lib/notices";
import { useAuth, isAdmin } from "@/lib/auth";
import { cn } from "@/lib/utils";

/** 심사 담당자용 공지 목록 — 읽기 전용. 작성·수정은 관리자 콘솔에서. */
export function NoticeList({ compact = false, limit }: { compact?: boolean; limit?: number }) {
  const { sorted } = useNotices();
  const { user } = useAuth();
  const items = limit ? sorted.slice(0, limit) : sorted;

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed px-3.5 py-5 text-[12px] text-muted-foreground">
        <Inbox className="h-4 w-4 shrink-0" />
        등록된 공지사항이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((n) => (
        <NoticeItem key={n.id} notice={n} compact={compact} />
      ))}
      {limit && sorted.length > limit && (
        <Link href="/notices" className="block pt-1 text-[11.5px] text-primary hover:underline">
          공지 {sorted.length - limit}건 더 보기
        </Link>
      )}
      {isAdmin(user) && !compact && (
        <p className="pt-1 text-[11px] text-muted-foreground">
          공지 작성·수정은{" "}
          <Link href="/admin" className="text-primary hover:underline">
            관리자 콘솔
          </Link>
          에서 할 수 있습니다.
        </p>
      )}
    </div>
  );
}

function NoticeItem({ notice, compact }: { notice: Notice; compact: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("rounded-lg border", notice.pinned && "border-primary/40 bg-primary/[0.03]")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left"
      >
        {notice.pinned ? (
          <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        ) : (
          <Megaphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            {notice.pinned && <Badge variant="info" className="text-[10px]">고정</Badge>}
            <span className={cn("text-[12.5px] font-bold", compact && "text-[12px]")}>{notice.title}</span>
          </span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            {notice.author} · {noticeDate(notice.createdAt)}
          </span>
        </span>
        <ChevronDown
          className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <p className="whitespace-pre-line border-t px-3.5 py-3 text-[12px] leading-relaxed text-muted-foreground">
          {notice.body}
        </p>
      )}
    </div>
  );
}

/** 공지 페이지 헤더 + 목록 */
export function NoticePage() {
  const { sorted } = useNotices();
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">공지사항</h1>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            심사 진행에 필요한 안내입니다. 총 {sorted.length}건
          </p>
        </div>
        {isAdmin(user) && (
          <Link
            href="/admin"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-[12px] font-medium text-primary-foreground hover:opacity-90"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            공지 작성
          </Link>
        )}
      </div>
      <NoticeList />
    </div>
  );
}

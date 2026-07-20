"use client";

import { useState } from "react";
import { Pencil, Pin, PinOff, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useNotices, noticeDate } from "@/lib/notices";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

/** 관리자 전용 공지 작성·수정·삭제. 같은 /notices 화면에서 담당자는 읽기만 본다. */
export function NoticeEditor() {
  const { sorted, create, update, remove } = useNotices();
  const { user } = useAuth();
  const [writing, setWriting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);

  function reset() {
    setWriting(false);
    setEditingId(null);
    setTitle("");
    setBody("");
    setPinned(false);
  }

  function submit() {
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) return;
    if (editingId != null) {
      update(editingId, { title: t, body: b, pinned });
    } else {
      create({ title: t, body: b, author: user?.name ?? "관리자", pinned });
    }
    reset();
  }

  function startEdit(id: number) {
    const n = sorted.find((x) => x.id === id);
    if (!n) return;
    setEditingId(id);
    setWriting(true);
    setTitle(n.title);
    setBody(n.body);
    setPinned(n.pinned);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-muted-foreground">
          작성한 공지는 심사 담당자의 공지사항 화면과 메인 페이지에 표시됩니다.
        </p>
        {!writing && (
          <button
            type="button"
            onClick={() => setWriting(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            새 공지
          </button>
        )}
      </div>

      {writing && (
        <div className="space-y-2.5 rounded-lg border p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-[12.5px] font-bold">{editingId != null ? "공지 수정" : "새 공지 작성"}</p>
            <button type="button" onClick={reset} aria-label="닫기" className="rounded p-1 text-muted-foreground hover:bg-muted">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목"
            className="w-full rounded-lg border bg-background px-3 py-2 text-[12.5px] outline-none focus:border-primary"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            placeholder="내용 (줄바꿈 그대로 표시됩니다)"
            className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-[12.5px] outline-none focus:border-primary"
          />

          <div className="flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-1.5 text-[12px]">
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              상단 고정 <span className="text-muted-foreground">(필독·마감 공지)</span>
            </label>
            <button
              type="button"
              onClick={submit}
              disabled={!title.trim() || !body.trim()}
              className="rounded-md bg-primary px-3.5 py-1.5 text-[12px] font-medium text-primary-foreground disabled:opacity-40"
            >
              {editingId != null ? "수정" : "등록"}
            </button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3.5 py-5 text-center text-[12px] text-muted-foreground">
          등록된 공지가 없습니다.
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {sorted.map((n) => (
            <div key={n.id} className={cn("px-3.5 py-2.5", n.pinned && "bg-primary/[0.03]")}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {n.pinned && <Badge variant="info" className="text-[10px]">고정</Badge>}
                    <span className="text-[12.5px] font-bold">{n.title}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {n.author} · {noticeDate(n.createdAt)}
                  </p>
                  <p className="mt-1 line-clamp-2 whitespace-pre-line text-[11.5px] text-muted-foreground">{n.body}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <IconBtn
                    label={n.pinned ? "고정 해제" : "상단 고정"}
                    onClick={() => update(n.id, { pinned: !n.pinned })}
                  >
                    {n.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  </IconBtn>
                  <IconBtn label="수정" onClick={() => startEdit(n.id)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </IconBtn>
                  <IconBtn label="삭제" danger onClick={() => remove(n.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconBtn>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted",
        danger && "hover:bg-bad-bg hover:text-bad"
      )}
    >
      {children}
    </button>
  );
}

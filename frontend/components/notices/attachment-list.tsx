"use client";

import { Download, FileText, X } from "lucide-react";
import { formatBytes, type NoticeAttachment } from "@/lib/notices";

/**
 * 첨부파일 목록. 작성 화면에서는 삭제 버튼과 함께, 읽기 화면에서는 내려받기만.
 *
 * 파일 본문이 data URL이라 <a download>만으로 저장된다(서버 왕복 없음).
 * 실 운영에서 서버 URL로 바뀌어도 이 컴포넌트는 그대로 쓸 수 있다.
 */
export function AttachmentList({
  attachments,
  onRemove,
}: {
  attachments: NoticeAttachment[];
  onRemove?: (id: string) => void;
}) {
  if (attachments.length === 0) return null;

  return (
    <ul className="space-y-1">
      {attachments.map((a) => (
        <li key={a.id} className="flex items-center gap-2 rounded-md bg-subtle px-2.5 py-1.5">
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-[12px]">{a.name}</span>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{formatBytes(a.size)}</span>
          <a
            href={a.dataUrl}
            download={a.name}
            title="내려받기"
            aria-label={`${a.name} 내려받기`}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(a.id)}
              title="첨부 제거"
              aria-label={`${a.name} 첨부 제거`}
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-bad-bg hover:text-bad"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

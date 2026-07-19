import Link from "next/link";
import { renderNoteBody } from "@/lib/notes";

/** 메모 본문 렌더 — 멘션은 대상 페이지로 가는 링크가 된다. */
export function NoteBody({ body, className }: { body: string; className?: string }) {
  return (
    <p className={className ?? "whitespace-pre-wrap text-[13px] leading-relaxed"}>
      {renderNoteBody(body).map((seg, i) =>
        seg.type === "text" ? (
          <span key={i}>{seg.text}</span>
        ) : (
          <Link
            key={i}
            href={seg.href}
            onClick={(e) => e.stopPropagation()}
            className="rounded bg-accent/10 px-1 py-0.5 font-medium text-accent hover:bg-accent/20"
          >
            {seg.ref.kind === "company" ? "@" : "#"}
            {seg.label}
          </Link>
        )
      )}
    </p>
  );
}

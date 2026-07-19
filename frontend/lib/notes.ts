import type { Note } from "@/types";

/** 멘션 인라인 마크업 — 백엔드 app/services/notes.py의 MENTION_RE와 형식이 같아야 한다.
 *   @[기업 1049](company:1049)
 *   #[스마트공장 보급확산사업](program:2024:B1_1_3)
 * 표시명을 함께 저장해 대상 이름이 바뀌거나 사라져도 문장이 깨지지 않게 한다. */
export const MENTION_RE = /([@#])\[([^\]]*)\]\((company:\d+|program:\d+:[^)]+)\)/g;

export type MentionRef =
  | { kind: "company"; id: number }
  | { kind: "program"; year: number; code: string };

export function refToToken(ref: MentionRef): string {
  return ref.kind === "company" ? `company:${ref.id}` : `program:${ref.year}:${ref.code}`;
}

export function parseRef(token: string): MentionRef | null {
  const parts = token.split(":");
  if (parts[0] === "company") return { kind: "company", id: Number(parts[1]) };
  if (parts[0] === "program" && parts.length >= 3) {
    return { kind: "program", year: Number(parts[1]), code: parts.slice(2).join(":") };
  }
  return null;
}

/** 멘션 마크업 조립 — 입력창에서 항목을 고를 때 본문에 끼워넣는 문자열. */
export function buildMention(label: string, ref: MentionRef): string {
  const sigil = ref.kind === "company" ? "@" : "#";
  // 대괄호가 표시명에 있으면 파싱이 깨지므로 제거한다.
  return `${sigil}[${label.replace(/[[\]]/g, "")}](${refToToken(ref)})`;
}

export type NoteSegment =
  | { type: "text"; text: string }
  | { type: "mention"; label: string; ref: MentionRef; href: string };

/** 본문 → 렌더링 세그먼트. 링크 경로까지 여기서 결정한다. */
export function renderNoteBody(body: string): NoteSegment[] {
  const out: NoteSegment[] = [];
  let last = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    const [full, , label, token] = m;
    const start = m.index ?? 0;
    if (start > last) out.push({ type: "text", text: body.slice(last, start) });
    const ref = parseRef(token);
    if (ref) {
      out.push({
        type: "mention",
        label,
        ref,
        href:
          ref.kind === "company"
            ? `/companies/${ref.id}`
            : `/programs?year=${ref.year}&program=${encodeURIComponent(ref.code)}`,
      });
    } else {
      out.push({ type: "text", text: full });
    }
    last = start + full.length;
  }
  if (last < body.length) out.push({ type: "text", text: body.slice(last) });
  return out;
}

/** 목록·검색용 평문 — 마크업을 표시명만 남겨 벗긴다. */
export function plainText(body: string): string {
  return body.replace(MENTION_RE, (_m, sigil, label) => `${sigil}${label}`);
}

export function mentionsCompany(note: Note, companyId: number): boolean {
  return note.mentions.some((m) => m.targetType === "company" && m.companyId === companyId);
}

export function mentionsProgram(note: Note, year: number, code: string): boolean {
  return note.mentions.some(
    (m) => m.targetType === "program" && m.programYear === year && m.programCode === code
  );
}

/** "3분 전" 같은 상대 시각 — 목록에서 절대시각보다 읽기 쉽다. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const diff = (now.getTime() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "방금";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`;
  return iso.slice(0, 10);
}

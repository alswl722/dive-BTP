"""메모 CRUD + 멘션 인덱싱 — notes / note_mentions 테이블.

본문에 인라인 마크업으로 들어있는 멘션을 저장 시 파싱해 note_mentions에 넣는다.
프론트(lib/notes.ts)의 정규식과 형식이 같아야 하므로 둘을 함께 고칠 것.
"""

from __future__ import annotations

import re

from sqlalchemy import text

from app.db import get_engine

# @[표시명](company:1049) · #[표시명](program:2024:B1_1_3)
MENTION_RE = re.compile(r"[@#]\[[^\]]*\]\((company:\d+|program:\d+:[^)]+)\)")


def parse_mentions(body: str) -> list[dict]:
    """본문 → 멘션 대상 목록(중복 제거). 형식이 깨진 건 조용히 무시한다."""
    seen: set[tuple] = set()
    out: list[dict] = []
    for ref in MENTION_RE.findall(body or ""):
        parts = ref.split(":")
        if parts[0] == "company":
            key = ("company", int(parts[1]))
            row = {"target_type": "company", "company_id": int(parts[1]),
                   "program_year": None, "program_code": None}
        else:  # program:{year}:{code}
            if len(parts) < 3:
                continue
            key = ("program", int(parts[1]), parts[2])
            row = {"target_type": "program", "company_id": None,
                   "program_year": int(parts[1]), "program_code": parts[2]}
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
    return out


def _replace_mentions(conn, note_id: int, body: str) -> None:
    conn.execute(text("DELETE FROM note_mentions WHERE note_id = :id"), {"id": note_id})
    rows = parse_mentions(body)
    if not rows:
        return
    conn.execute(
        text("""
            INSERT INTO note_mentions (note_id, target_type, company_id, program_year, program_code)
            VALUES (:note_id, :target_type, :company_id, :program_year, :program_code)
        """),
        [{**r, "note_id": note_id} for r in rows],
    )


_SELECT = """
SELECT n.id, n.body, n.author, n.created_at, n.updated_at,
       COALESCE(
         json_agg(
           json_build_object(
             'targetType', m.target_type,
             'companyId', m.company_id,
             'programYear', m.program_year,
             'programCode', m.program_code
           )
         ) FILTER (WHERE m.note_id IS NOT NULL), '[]'
       ) AS mentions
FROM notes n
LEFT JOIN note_mentions m ON m.note_id = n.id
"""


def _to_dict(r) -> dict:
    return {
        "id": r["id"],
        "body": r["body"],
        "author": r["author"],
        "createdAt": r["created_at"].isoformat(),
        "updatedAt": r["updated_at"].isoformat(),
        "mentions": r["mentions"],
    }


def list_notes(company_id: int | None = None,
               program_year: int | None = None,
               program_code: str | None = None) -> list[dict]:
    """전체 목록 또는 특정 대상이 언급된 메모(역방향 조회)."""
    where, params = "", {}
    if company_id is not None:
        # 서브쿼리로 거른다 — JOIN에 조건을 걸면 mentions 집계가 잘린다.
        where = """WHERE n.id IN (SELECT note_id FROM note_mentions
                                  WHERE target_type='company' AND company_id = :cid)"""
        params = {"cid": company_id}
    elif program_year is not None and program_code is not None:
        where = """WHERE n.id IN (SELECT note_id FROM note_mentions
                                  WHERE target_type='program' AND program_year = :py AND program_code = :pc)"""
        params = {"py": program_year, "pc": program_code}

    sql = f"{_SELECT} {where} GROUP BY n.id ORDER BY n.created_at DESC"
    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(text(sql), params).mappings().all()
    return [_to_dict(r) for r in rows]


def create_note(body: str, author: str) -> dict:
    engine = get_engine()
    with engine.begin() as conn:
        note_id = conn.execute(
            text("INSERT INTO notes (body, author) VALUES (:b, :a) RETURNING id"),
            {"b": body, "a": author},
        ).scalar_one()
        _replace_mentions(conn, note_id, body)
        row = conn.execute(text(f"{_SELECT} WHERE n.id = :id GROUP BY n.id"), {"id": note_id}).mappings().one()
        return _to_dict(row)


def update_note(note_id: int, body: str) -> dict | None:
    engine = get_engine()
    with engine.begin() as conn:
        updated = conn.execute(
            text("UPDATE notes SET body = :b, updated_at = now() WHERE id = :id RETURNING id"),
            {"b": body, "id": note_id},
        ).scalar()
        if updated is None:
            return None
        _replace_mentions(conn, note_id, body)
        row = conn.execute(text(f"{_SELECT} WHERE n.id = :id GROUP BY n.id"), {"id": note_id}).mappings().one()
        return _to_dict(row)


def delete_note(note_id: int) -> bool:
    engine = get_engine()
    with engine.begin() as conn:
        # note_mentions는 ON DELETE CASCADE로 함께 지워진다.
        deleted = conn.execute(
            text("DELETE FROM notes WHERE id = :id RETURNING id"), {"id": note_id}
        ).scalar()
    return deleted is not None

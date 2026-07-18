"""찜 상태(후보/선정/보류/제외) 조회·갱신 — company_review_status 테이블.

행이 없는 기업은 기본값 '후보'로 취급(마이그레이션 011 COMMENT 참고).
"""

from __future__ import annotations

from sqlalchemy import text

from app.db import get_engine

DEFAULT_STATUS = "후보"
VALID_STATUSES = {"후보", "선정", "보류", "제외"}


def get_all_statuses() -> dict[int, str]:
    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT company_id, status FROM company_review_status")).fetchall()
    return {r.company_id: r.status for r in rows}


def get_status(company_id: int) -> str:
    engine = get_engine()
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT status FROM company_review_status WHERE company_id = :cid"),
            {"cid": company_id},
        ).fetchone()
    return row.status if row else DEFAULT_STATUS


def set_status(company_id: int, status: str) -> str:
    if status not in VALID_STATUSES:
        raise ValueError(f"허용되지 않은 상태: {status} (허용: {sorted(VALID_STATUSES)})")
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO company_review_status (company_id, status, updated_at)
                VALUES (:cid, :status, now())
                ON CONFLICT (company_id)
                DO UPDATE SET status = :status, updated_at = now()
                """
            ),
            {"cid": company_id, "status": status},
        )
    return status

"""사업 단위 심사 상태(후보/선정/제외) 조회·갱신 — company_program_review_status 테이블.

같은 기업이 여러 사업에 신청할 수 있어 상태를 (company_id, program_key)로 구분한다.
행이 없는 (기업,사업)은 기본값 '후보'로 취급(마이그레이션 014 COMMENT 참고).
program_key = "연도:사업코드" (프론트 programKey와 동일 포맷).
'보류'는 015에서 폐지 — 미결정은 '후보'로 통일한다.
"""

from __future__ import annotations

from sqlalchemy import text

from app.db import get_engine

DEFAULT_STATUS = "후보"
VALID_STATUSES = {"후보", "선정", "제외"}


def get_all_statuses() -> list[dict]:
    """전체 (기업, 사업) 상태 레코드. 프론트가 초기 로드해 keyed map으로 만든다."""
    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT company_id, program_key, status FROM company_program_review_status")
        ).fetchall()
    return [
        {"companyId": r.company_id, "programKey": r.program_key, "status": r.status}
        for r in rows
    ]


def get_status(company_id: int, program_key: str) -> str:
    engine = get_engine()
    with engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT status FROM company_program_review_status "
                "WHERE company_id = :cid AND program_key = :pk"
            ),
            {"cid": company_id, "pk": program_key},
        ).fetchone()
    return row.status if row else DEFAULT_STATUS


def set_status(company_id: int, program_key: str, status: str) -> str:
    if status not in VALID_STATUSES:
        raise ValueError(f"허용되지 않은 상태: {status} (허용: {sorted(VALID_STATUSES)})")
    if not program_key:
        raise ValueError("program_key가 필요합니다 (사업 단위 상태)")
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO company_program_review_status (company_id, program_key, status, updated_at)
                VALUES (:cid, :pk, :status, now())
                ON CONFLICT (company_id, program_key)
                DO UPDATE SET status = :status, updated_at = now()
                """
            ),
            {"cid": company_id, "pk": program_key, "status": status},
        )
    return status

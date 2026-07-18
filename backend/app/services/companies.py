"""Company/Rankings/Dashboard 서비스 레이어 — DB(Postgres)를 소스로 company_view를 호출.

backend/etl/company_view.py의 build_* 함수를 그대로 재사용한다(export_fixtures.py와
동일 로직 공유). backend/etl은 __init__.py 없는 플랫 스크립트 모음이라(features_finance.py
등도 같은 방식) sys.path에 그 디렉토리를 넣어 모듈처럼 import한다.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
from sqlalchemy import text

from app.db import get_engine
from app.services import review_status as review_status_service

_ETL_DIR = Path(__file__).resolve().parents[2] / "etl"
if str(_ETL_DIR) not in sys.path:
    sys.path.insert(0, str(_ETL_DIR))

from company_view import KEY, build_companies, build_dashboard, build_rankings  # noqa: E402


def _with_review_status(rows: list[dict]) -> list[dict]:
    statuses = review_status_service.get_all_statuses()
    for row in rows:
        row["reviewStatus"] = statuses.get(row["id"], review_status_service.DEFAULT_STATUS)
    return rows


def company_exists(company_id: int) -> bool:
    """PATCH 존재 확인용 — get_company()의 4테이블 pandas 파이프라인 대신 PK 조회 1건만."""
    engine = get_engine()
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT 1 FROM companies WHERE company_id = :cid"), {"cid": company_id}
        ).fetchone()
    return row is not None


def _load_source():
    engine = get_engine()
    master = pd.read_sql_table("master_table", engine)
    feat = pd.read_sql_table("features_finance", engine)
    score = pd.read_sql_table("features_score", engine)
    sr = pd.read_sql_table("support_records", engine)
    sp = pd.read_sql_table("support_programs", engine)  # 축8 프로그램명·설명 조인용
    bp = pd.read_sql_table("company_business_purposes", engine)  # 축8 LLM 캐시 조회용
    llm_cache = _load_llm_cache(engine)
    return score, feat, master, sr, sp, bp, llm_cache


def _load_llm_cache(engine) -> dict:
    """axis8_llm_cache 테이블에서 판정 결과 로드.

    반환: {(company_id, program_code, purposes_hash): {match_type, score, matched_keywords, reasoning}}
    테이블 없으면 빈 dict (배치 미실행 상태).
    """
    import json
    try:
        rows = pd.read_sql_query(text("""
            SELECT company_id, program_code, purposes_hash,
                   score, match_type, matched_keywords, reasoning
            FROM axis8_llm_cache
        """), engine)
    except Exception:
        return {}
    cache: dict = {}
    for _, r in rows.iterrows():
        try:
            keywords = json.loads(r["matched_keywords"]) if r["matched_keywords"] else []
        except (TypeError, ValueError):
            keywords = []
        cache[(int(r["company_id"]), str(r["program_code"]), str(r["purposes_hash"]))] = {
            "match_type": r["match_type"],
            "score": r["score"],
            "matched_keywords": keywords,
            "reasoning": r["reasoning"] or "",
        }
    return cache


def list_companies() -> list[dict]:
    score, feat, master, sr, sp, bp, llm_cache = _load_source()
    return _with_review_status(
        build_companies(score, feat, master, sr, sp, bp, llm_cache)
    )


def get_company(company_id: int) -> dict | None:
    score, feat, master, sr, sp, bp, llm_cache = _load_source()
    score = score[score[KEY] == company_id]
    if score.empty:
        return None
    company = build_companies(score, feat, master, sr, sp, bp, llm_cache)[0]
    company["reviewStatus"] = review_status_service.get_status(company_id)
    return company


def get_rankings() -> dict:
    return build_rankings(list_companies())


def get_dashboard() -> dict:
    return build_dashboard(list_companies())

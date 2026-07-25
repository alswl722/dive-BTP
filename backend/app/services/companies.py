"""Company/Rankings/Dashboard 서비스 레이어 — DB(Postgres)를 소스로 company_view를 호출.

backend/etl/company_view.py의 build_* 함수를 그대로 재사용한다(export_fixtures.py와
동일 로직 공유). backend/etl은 __init__.py 없는 플랫 스크립트 모음이라(features_finance.py
등도 같은 방식) sys.path에 그 디렉토리를 넣어 모듈처럼 import한다.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import pandas as pd
from sqlalchemy import text

from app.db import get_engine
from app.services import review_status as review_status_service

_ETL_DIR = Path(__file__).resolve().parents[2] / "etl"
if str(_ETL_DIR) not in sys.path:
    sys.path.insert(0, str(_ETL_DIR))

from company_view import KEY, build_companies, build_dashboard, build_rankings  # noqa: E402

# 기업 수가 커지면(1,200+) 매 요청마다 7개 테이블을 다시 읽고 전체를 재조립하는 비용이
# 커진다. 조립 결과(reviewStatus 붙이기 전)를 TTL 동안 캐싱 — reviewStatus(찜 상태)는
# PATCH로 자주 바뀌므로 캐시 대상에서 제외하고 매 요청 최신값을 별도로 덧붙인다.
_CACHE_TTL_SECONDS = 300
_cache: dict = {"companies": None, "unmatched_support_records": 0, "loaded_at": 0.0}


def invalidate_cache() -> None:
    """조립 캐시를 강제로 무효화한다(수동 새로고침·관리용 엔드포인트에서 사용)."""
    _cache["companies"] = None
    _cache["unmatched_support_records"] = 0
    _cache["loaded_at"] = 0.0


def _get_cached_companies() -> list[dict]:
    """build_companies() 결과(reviewStatus 미포함)를 TTL 캐시로 재사용."""
    now = time.monotonic()
    if _cache["companies"] is None or (now - _cache["loaded_at"]) >= _CACHE_TTL_SECONDS:
        score, feat, master, sr, sp, bp, llm_cache, tech = _load_source()
        _cache["companies"] = build_companies(score, feat, master, sr, sp, bp, llm_cache, tech)
        # company_id가 NULL인 support_records 행 — 원본 기업일련번호='매칭정보없음'로
        # BTP-KODATA 조인이 안 된 실제 선정/탈락 기록. 어느 기업 객체에도 못 붙어
        # companies 리스트에 흔적이 없으므로 대시보드 각주용으로 따로 세어 캐싱.
        # (축9_설계노트.md §6-2)
        _cache["unmatched_support_records"] = int(sr["company_id"].isna().sum())
        _cache["loaded_at"] = now
    return _cache["companies"]


def _with_review_status(rows: list[dict]) -> list[dict]:
    # 상태는 이제 (기업, 사업) 단위(company_program_review_status) — 기업 객체에 단일 상태를
    # 실을 수 없다. 프론트는 GET /review-status로 전체 상태를 받아 사업별로 적용한다.
    # 스키마 호환을 위해 기본값만 채운다(이 필드는 더 이상 권위 없음).
    for row in rows:
        row["reviewStatus"] = review_status_service.DEFAULT_STATUS
    return rows


def company_exists(company_id: int) -> bool:
    """PATCH 존재 확인용 — get_company()의 4테이블 pandas 파이프라인 대신 PK 조회 1건만."""
    engine = get_engine()
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT 1 FROM companies WHERE company_id = :cid"), {"cid": company_id}
        ).fetchone()
    return row is not None


def _load_tech_tables(engine) -> dict | None:
    """기술축(축4·5·6) 원장 테이블 — aggregate_tech/domain_tech 입력.

    master_table의 특허·NTIS 집계컬럼은 신뢰 불가(특허=비단조 flow+상표·디자인 혼입,
    NTIS=스냅샷 중복)라 원장을 직접 넘긴다. 테이블이 없으면 None → 기존 폴백 동작.
    """
    names = ["companies", "company_yearly_metrics", "company_certifications",
             "patents", "ntis_lead_projects", "ntis_consigned_projects"]
    try:
        return {n: pd.read_sql_table(n, engine) for n in names}
    except Exception as e:  # noqa: BLE001 — 스키마 미완성 환경에서도 API는 떠야 함
        print(f"  ⚠️ 기술축 원장 로드 실패 — 기술 지표 생략: {e}")
        return None


def _load_source():
    engine = get_engine()
    master = pd.read_sql_table("master_table", engine)
    feat = pd.read_sql_table("features_finance", engine)
    score = pd.read_sql_table("features_score", engine)
    sr = pd.read_sql_table("support_records", engine)
    sp = pd.read_sql_table("support_programs", engine)  # 축8 프로그램명·설명 조인용
    bp = pd.read_sql_table("company_business_purposes", engine)  # 축8 LLM 캐시 조회용
    llm_cache = _load_llm_cache(engine)
    tech_tables = _load_tech_tables(engine)
    return score, feat, master, sr, sp, bp, llm_cache, tech_tables


LLM_CACHE_FIXTURE = Path(__file__).resolve().parent / "axis8_llm_cache.json"


def _load_llm_cache(engine) -> dict:
    """축8 LLM 판정 캐시 로드 — fixture(리포지토리 커밋) → DB(로컬 배치) 순으로 덮어씀.

    팀원 대부분은 DEEPSEEK_API_KEY 미보유라 배치 실행 불가. 기술리드가 배치 결과를
    scripts/export_axis8_llm_cache.py로 fixture에 덤프해 커밋하면 pull만 받아도 판정
    결과가 화면에 뜬다. 로컬에서 배치를 재실행한 팀원의 경우 DB가 fixture를 덮어씀
    (신선한 판정 우선).

    반환: {(company_id, program_code, purposes_hash): {match_type, score, matched_keywords, reasoning}}
    """
    cache = _load_llm_cache_fixture()
    cache.update(_load_llm_cache_db(engine))
    return cache


def _load_llm_cache_fixture() -> dict:
    """리포지토리 커밋된 JSON에서 판정 결과 로드. 파일 없거나 비면 빈 dict."""
    import json
    if not LLM_CACHE_FIXTURE.exists():
        return {}
    try:
        items = json.loads(LLM_CACHE_FIXTURE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        print(f"  ⚠️ 축8 LLM fixture 로드 실패 — 무시: {e}")
        return {}
    cache: dict = {}
    for item in items:
        try:
            cache[(int(item["company_id"]), str(item["program_code"]), str(item["purposes_hash"]))] = {
                "match_type": item["match_type"],
                "score": item.get("score"),
                "matched_keywords": item.get("matched_keywords") or [],
                "reasoning": item.get("reasoning") or "",
            }
        except (KeyError, TypeError, ValueError):
            continue  # 손상된 행은 건너뛰기 — 전체 캐시 무효화 방지
    return cache


def _load_llm_cache_db(engine) -> dict:
    """axis8_llm_cache 테이블에서 판정 결과 로드. 테이블 없으면 빈 dict."""
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
    return _with_review_status(_get_cached_companies())


def get_company(company_id: int) -> dict | None:
    match = next((c for c in _get_cached_companies() if c["id"] == company_id), None)
    if match is None:
        return None
    company = dict(match)
    company["reviewStatus"] = review_status_service.DEFAULT_STATUS  # 사업 단위 → GET /review-status 사용
    return company


def get_rankings() -> dict:
    return build_rankings(list_companies())


def get_dashboard() -> dict:
    companies = list_companies()
    return build_dashboard(companies, unmatched_support_records=_cache["unmatched_support_records"])

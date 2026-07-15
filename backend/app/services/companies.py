"""Company/Rankings/Dashboard 서비스 레이어 — DB(Postgres)를 소스로 company_view를 호출.

backend/etl/company_view.py의 build_* 함수를 그대로 재사용한다(export_fixtures.py와
동일 로직 공유). backend/etl은 __init__.py 없는 플랫 스크립트 모음이라(features_finance.py
등도 같은 방식) sys.path에 그 디렉토리를 넣어 모듈처럼 import한다.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

from app.db import get_engine

_ETL_DIR = Path(__file__).resolve().parents[2] / "etl"
if str(_ETL_DIR) not in sys.path:
    sys.path.insert(0, str(_ETL_DIR))

from company_view import KEY, build_companies, build_dashboard, build_rankings  # noqa: E402


def _load_source():
    engine = get_engine()
    master = pd.read_sql_table("master_table", engine)
    feat = pd.read_sql_table("features_finance", engine)
    score = pd.read_sql_table("features_score", engine)
    sr = pd.read_sql_table("support_records", engine)
    return score, feat, master, sr


def list_companies() -> list[dict]:
    score, feat, master, sr = _load_source()
    return build_companies(score, feat, master, sr)


def get_company(company_id: int) -> dict | None:
    score, feat, master, sr = _load_source()
    score = score[score[KEY] == company_id]
    if score.empty:
        return None
    return build_companies(score, feat, master, sr)[0]


def get_rankings() -> dict:
    return build_rankings(list_companies())


def get_dashboard() -> dict:
    return build_dashboard(list_companies())

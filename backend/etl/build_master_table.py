"""master_table 뷰 + support_records 테이블(Postgres) → backend/etl/data/*.parquet 덤프.

팀원A(finance_utils/features_finance/scoring_finance)와 프론트(export_fixtures)는
parquet 모드로 로컬 개발 중이었다(DB 없이도 로직 검증 가능). run_etl.py로 DB 적재를
마친 뒤 이 스크립트를 돌리면 parquet 모드가 최신 데이터로 동기화된다.

    DATABASE_URL=... python build_master_table.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine

DATA_DIR = Path(__file__).resolve().parent / "data"
TABLES = {
    "master_table": DATA_DIR / "master_table.parquet",
    "support_records": DATA_DIR / "support_records.parquet",
    "support_programs": DATA_DIR / "support_programs.parquet",
}


def main():
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL 미설정 — .env 확인 (docker-compose와 동일 값)")

    engine = create_engine(url)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for table, out_path in TABLES.items():
        df = pd.read_sql_table(table, engine)
        df.to_parquet(out_path, index=False)
        print(f"✅ {out_path} ({df.shape[0]}행 × {df.shape[1]}컬럼)")


if __name__ == "__main__":
    main()

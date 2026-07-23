"""ETL 적재 직후 결측치·행수 검수 리포트.

run_etl.py로 새 엑셀(본선 데이터 등)을 적재한 뒤 실행해, 테이블·컬럼별
결측률과 기업 수 대비 커버리지를 한눈에 확인한다. DB 스키마를 정보스키마로
직접 조회하므로 테이블이 늘어나도 코드 수정 없이 동작한다.

사용법:
    DATABASE_URL=postgresql://foedev:foedev@localhost:5432/foedev python check_data_quality.py
    DATABASE_URL=... python check_data_quality.py --threshold 0.3   # 결측률 30% 이상만 표시
"""

from __future__ import annotations

import argparse
import os
import sys

import pandas as pd
from sqlalchemy import create_engine, inspect, text

# run_etl.py가 적재하는 테이블(의존 순서 그대로) — 새 테이블 추가 시 여기만 갱신
ETL_TABLES = [
    "companies",
    "company_yearly_metrics",
    "company_certifications",
    "patents",
    "ntis_lead_projects",
    "ntis_consigned_projects",
    "company_business_purposes",
    "ref_business_types",
    "ref_support_types",
    "support_programs",
    "support_records",
    "industry_code_map",
    "support_type_check",
]


def get_engine():
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL 미설정 — .env 확인 (docker-compose와 동일 값)")
    return create_engine(url)


def check_table(engine, table: str, threshold: float) -> None:
    inspector = inspect(engine)
    if table not in inspector.get_table_names():
        print(f"⚠️  {table}: 테이블 없음 (마이그레이션 미적용?)")
        return

    with engine.connect() as conn:
        total = conn.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar()

    if total == 0:
        print(f"⚠️  {table}: 0행 (적재 안 됨)")
        return

    df = pd.read_sql_table(table, engine)
    print(f"\n■ {table} — {total}행")

    rows = []
    for col in df.columns:
        n_missing = df[col].isna().sum()
        rate = n_missing / total
        if rate >= threshold:
            rows.append((col, n_missing, rate))

    if not rows:
        print(f"  결측률 {threshold:.0%} 이상 컬럼 없음")
        return

    rows.sort(key=lambda r: r[2], reverse=True)
    for col, n_missing, rate in rows:
        print(f"  {col:30s} 결측 {n_missing:>5}/{total} ({rate:.1%})")


def check_company_coverage(engine) -> None:
    """companies를 기준으로 다른 기업종속 테이블에 실제로 매칭되는 기업 비율."""
    with engine.connect() as conn:
        total_companies = conn.execute(text("SELECT COUNT(*) FROM companies")).scalar()
    if not total_companies:
        return

    print(f"\n■ 기업 커버리지 (전체 {total_companies}개사 기준)")
    dependent = [
        ("company_yearly_metrics", "company_id"),
        ("company_certifications", "company_id"),
        ("patents", "company_id"),
        ("ntis_lead_projects", "company_id"),
        ("ntis_consigned_projects", "company_id"),
        ("company_business_purposes", "company_id"),
        ("support_records", "company_id"),
    ]
    inspector = inspect(engine)
    for table, key in dependent:
        if table not in inspector.get_table_names():
            continue
        with engine.connect() as conn:
            n = conn.execute(text(f'SELECT COUNT(DISTINCT "{key}") FROM "{table}"')).scalar()
        rate = n / total_companies
        print(f"  {table:30s} {n:>5}/{total_companies}개사 매칭 ({rate:.1%})")


def main():
    parser = argparse.ArgumentParser(description="ETL 적재 결과 결측치·커버리지 검수")
    parser.add_argument("--threshold", type=float, default=0.0,
                         help="이 비율 이상 결측인 컬럼만 표시 (기본 0 = 전부 표시)")
    args = parser.parse_args()

    engine = get_engine()

    print("=" * 60)
    print("ETL 데이터 품질 리포트")
    print("=" * 60)

    for table in ETL_TABLES:
        check_table(engine, table, args.threshold)

    check_company_coverage(engine)

    print("\n" + "=" * 60)
    print("✅ 검수 완료 — 위 결측률이 예상 밖으로 높은 컬럼은 config/*.yaml 매핑이나")
    print("   원본 엑셀 시트 구조(헤더 행 위치 등)를 먼저 의심할 것")
    print("=" * 60)


if __name__ == "__main__":
    main()

"""프론트 뼈대용 fixture 생성: parquet → frontend/lib/fixtures/*.json.

조립 로직 본체는 company_view.py(DB 소스인 FastAPI 서비스와 공유). 이 스크립트는
parquet 4개를 읽어 그 함수들을 호출하고 JSON으로 쓰는 얇은 CLI일 뿐이다.

※ 스코어링/파생 모듈에 의존하지 않는 standalone 스크립트(프론트 브랜치에서도 실행).
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from company_view import build_companies, build_dashboard, build_rankings

DATA_DIR = Path(__file__).resolve().parent / "data"
OUT_DIR = Path(__file__).resolve().parents[1].parent / "frontend" / "lib" / "fixtures"


def main():
    score = pd.read_parquet(DATA_DIR / "features_score.parquet")
    feat = pd.read_parquet(DATA_DIR / "features_finance.parquet")
    master = pd.read_parquet(DATA_DIR / "master_table.parquet")
    sr = pd.read_parquet(DATA_DIR / "support_records.parquet")

    companies = build_companies(score, feat, master, sr)
    rankings = build_rankings(companies)
    dashboard = build_dashboard(companies)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, data in [("companies", companies), ("rankings", rankings), ("dashboard", dashboard)]:
        (OUT_DIR / f"{name}.json").write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  ✓ {name}.json ({OUT_DIR / f'{name}.json'})")
    print(f"\n✅ fixture {len(companies)}개 기업 생성 완료")


if __name__ == "__main__":
    main()

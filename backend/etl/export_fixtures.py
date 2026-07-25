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


def _load_tech_tables():
    """기술축 원장 테이블. parquet에 없으면 샘플 엑셀(dev_loader)에서 로드.

    특허·NTIS는 master_table 집계컬럼이 신뢰 불가라(비단조 flow·스냅샷 중복)
    원장을 직접 넘겨야 정확한 값이 나온다.
    """
    try:
        from dev_loader import load_tables
        return load_tables()
    except SystemExit as e:      # 샘플 엑셀을 못 찾은 경우
        print(f"  ⚠️ 기술축 원장 로드 실패 — 기술 지표 없이 생성: {e}")
    except ImportError as e:
        print(f"  ⚠️ dev_loader 없음 — 기술 지표 없이 생성: {e}")
    return None


def main():
    score = pd.read_parquet(DATA_DIR / "features_score.parquet")
    feat = pd.read_parquet(DATA_DIR / "features_finance.parquet")
    master = pd.read_parquet(DATA_DIR / "master_table.parquet")
    sr = pd.read_parquet(DATA_DIR / "support_records.parquet")
    sp_path = DATA_DIR / "support_programs.parquet"
    sp = pd.read_parquet(sp_path) if sp_path.exists() else None
    if sp is None:
        print("  ⚠️ support_programs.parquet 없음 — programName 없이 생성(build_master_table.py 재실행 필요)")

    companies = build_companies(score, feat, master, sr, sp=sp,
                                tech_tables=_load_tech_tables())
    rankings = build_rankings(companies)
    # company_id가 NULL인 support_records 행(원본 기업일련번호='매칭정보없음' — BTP-KODATA
    # 조인 실패, 축9_설계노트.md §6-2)은 companies 리스트에 흔적이 없어 대시보드 각주로 별도 표기.
    unmatched = int(sr["company_id"].isna().sum())
    dashboard = build_dashboard(companies, unmatched_support_records=unmatched)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, data in [("companies", companies), ("rankings", rankings), ("dashboard", dashboard)]:
        (OUT_DIR / f"{name}.json").write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  ✓ {name}.json ({OUT_DIR / f'{name}.json'})")
    print(f"\n✅ fixture {len(companies)}개 기업 생성 완료")


if __name__ == "__main__":
    main()

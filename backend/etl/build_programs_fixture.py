"""지원사업 목록 fixture 생성: DB support_programs(실사업 757건) + support_records 집계 → programs.json.

app/services/programs.py(실 API)와 동일 쿼리를 쓴다. programs는 4개 핵심 parquet
(export_fixtures.py가 읽는 score/feat/master/sr)에 안 걸쳐 있는 별도 도메인이라 여기서는
DB에서 바로 읽는다(팀 컨벤션상 DB가 소스오브트루스 — CLAUDE.md 참고).

사용:
    DATABASE_URL=postgresql://foedev:foedev@localhost:5432/foedev python build_programs_fixture.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from sqlalchemy import create_engine, text

OUT_DIR = Path(__file__).resolve().parents[2] / "frontend" / "lib" / "fixtures"

_QUERY = """
SELECT sp.year, sp.program_code, sp.program_name, sp.macro_category, sp.business_type,
       sp.start_date, sp.end_date, sp.ministry, sp.local_gov, sp.description,
       COUNT(DISTINCT sr.company_id) AS applicant_count,
       COUNT(DISTINCT sr.company_id) FILTER (WHERE sr.selection_result = '지원대상') AS selected_count,
       COALESCE(SUM(sr.support_amount_thousand_krw) FILTER (WHERE sr.selection_result = '지원대상'), 0) AS total_amount,
       COUNT(*) FILTER (WHERE sr.selection_result = '지원대상'
                          AND sr.support_amount_thousand_krw IS NULL) AS amount_missing_count,
       ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(sr.support_detail_main, '')), NULL) AS detail_items
FROM support_programs sp
LEFT JOIN support_records sr ON sr.year = sp.year AND sr.program_code = sp.program_code
GROUP BY sp.year, sp.program_code, sp.program_name, sp.macro_category, sp.business_type,
         sp.start_date, sp.end_date, sp.ministry, sp.local_gov, sp.description
ORDER BY sp.year DESC, applicant_count DESC
"""


def main():
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL 미설정 — .env 확인")
    engine = create_engine(url)
    with engine.connect() as conn:
        rows = conn.execute(text(_QUERY)).mappings().all()

    programs = [
        {
            "year": r["year"],
            "programCode": r["program_code"],
            "name": r["program_name"],
            "macroCategory": r["macro_category"],
            "businessType": r["business_type"],
            "startDate": r["start_date"].isoformat() if r["start_date"] else None,
            "endDate": r["end_date"].isoformat() if r["end_date"] else None,
            "ministry": r["ministry"],
            "localGov": r["local_gov"],
            "description": r["description"],
            "applicantCount": r["applicant_count"],
            "selectedCount": r["selected_count"],
            "totalAmountThousand": float(r["total_amount"]),
            "amountMissingCount": r["amount_missing_count"],
            "detailItems": list(r["detail_items"]),
        }
        for r in rows
    ]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "programs.json").write_text(
        json.dumps(programs, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"✅ programs.json ({len(programs)}건) → {OUT_DIR / 'programs.json'}")


if __name__ == "__main__":
    main()

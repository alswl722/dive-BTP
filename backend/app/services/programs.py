"""support_programs(실제 부산TP 2022~2024 사업목록, 757건) + support_records 집계.

⚠️ 알려진 데이터 이슈: support_programs.business_type(사업목록 시트)엔 'RnD'가 있지만
support_records.business_type(기업지원목록 시트)엔 없음(대신 '기타' 등) — 원본 시트 간
사업유형 표기가 어긋나 있다(ETL 버그 아님, config에 리매핑 없음). 지원사업 목록 필터는
support_programs.business_type을 기준으로 쓴다.
"""

from __future__ import annotations

from sqlalchemy import text

from app.db import get_engine

_QUERY = """
SELECT sp.year, sp.program_code, sp.program_name, sp.macro_category, sp.business_type,
       sp.start_date, sp.end_date, sp.ministry, sp.local_gov, sp.description,
       COUNT(DISTINCT sr.company_id) AS applicant_count,
       COUNT(DISTINCT sr.company_id) FILTER (WHERE sr.selection_result = '지원대상') AS selected_count,
       COALESCE(SUM(sr.support_amount_thousand_krw) FILTER (WHERE sr.selection_result = '지원대상'), 0) AS total_amount,
       ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(sr.support_detail_main, '')), NULL) AS detail_items
FROM support_programs sp
LEFT JOIN support_records sr ON sr.year = sp.year AND sr.program_code = sp.program_code
GROUP BY sp.year, sp.program_code, sp.program_name, sp.macro_category, sp.business_type,
         sp.start_date, sp.end_date, sp.ministry, sp.local_gov, sp.description
ORDER BY sp.year DESC, applicant_count DESC
"""


def list_programs() -> list[dict]:
    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(text(_QUERY)).mappings().all()
    return [
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
            "detailItems": list(r["detail_items"]),
        }
        for r in rows
    ]

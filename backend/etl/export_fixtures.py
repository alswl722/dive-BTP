"""프론트 뼈대용 fixture 생성: parquet → frontend/lib/fixtures/*.json.

재무 축 산출물(features_score/features_finance)과 master_table, support_records를
읽어 프론트가 API 없이 렌더할 수 있는 JSON fixture를 만든다.
- 실데이터: 4축 점수·백분위·5개년 재무추세·인증·특허·NTIS·지원 집계·지원이력 타임라인
- 목업(아직 미구현): 사업목적-지원사업 정합성(businessFit)

※ 스코어링/파생 모듈에 의존하지 않는 standalone 스크립트(프론트 브랜치에서도 실행).
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

import pandas as pd

KEY = "기업일련번호"
DATA_DIR = Path(__file__).resolve().parent / "data"
OUT_DIR = Path(__file__).resolve().parents[1].parent / "frontend" / "lib" / "fixtures"
YEARS = [2020, 2021, 2022, 2023, 2024]

CERTS = ["이노비즈", "메인비즈", "벤처기업", "소재부품", "NET", "NEP"]
AXES = ["성장성", "수익성", "효율성", "안정성"]
RESULT_MAP = {"지원대상": "선정", "탈락": "탈락", "포기": "포기"}


def clean(v):
    """numpy/NaN → JSON 안전값."""
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    if hasattr(v, "item"):
        v = v.item()
    if isinstance(v, float) and math.isnan(v):
        return None
    return v


def col_year_map(df, hint):
    out = {}
    for c in df.columns:
        if hint in str(c):
            m = re.search(r"(20\d{2})", str(c))
            if m:
                out[int(m.group(1))] = c
    return dict(sorted(out.items()))


def trend(df_row, df, hint):
    ymap = col_year_map(df, hint)
    return [{"year": y, "value": clean(pd.to_numeric(df_row[c], errors="coerce"))}
            for y, c in ymap.items()]


def yn(v):
    return str(v).strip().upper() in {"Y", "1", "TRUE", "유", "T"}


def support_history(cid: int, sr: pd.DataFrame):
    """support_records(부산TP 2022~2024_기업지원목록 통합)에서 기업별 실제 지원이력 타임라인.

    선정일(selected_date)이 없으면 시작일(start_date)로 대체. 둘 다 없는 행은
    타임라인에 날짜를 못 매길 근거가 없어 제외(원본 결측 그대로 반영, 임의값 대체 안 함).
    """
    rows = sr[sr["company_id"] == cid]  # support_records는 DB 원본 컬럼명(영문)이라 KEY와 다름
    records = []
    for _, r in rows.iterrows():
        date = r["selected_date"] if pd.notna(r["selected_date"]) else r["start_date"]
        if pd.isna(date):
            continue
        result = RESULT_MAP.get(str(r["selection_result"]).strip(), str(r["selection_result"]).strip())
        amount = pd.to_numeric(r["support_amount_thousand_krw"], errors="coerce")
        records.append({
            "date": pd.Timestamp(date).strftime("%Y-%m-%d"),
            "result": result,
            "bizType": clean(r["business_type"]) or "기타",
            "amount": clean(amount) or 0,
        })
    records.sort(key=lambda x: x["date"], reverse=True)
    return records


def main():
    score = pd.read_parquet(DATA_DIR / "features_score.parquet")
    feat = pd.read_parquet(DATA_DIR / "features_finance.parquet")
    master = pd.read_parquet(DATA_DIR / "master_table.parquet")
    sr = pd.read_parquet(DATA_DIR / "support_records.parquet")

    def mcol(hint):
        return next((c for c in master.columns if hint in str(c)), None)

    ind_col, region_col, ksic_col = mcol("업종명"), mcol("지역"), mcol("KSIC")
    pct_cols = [c for c in score.columns if c.startswith("pct_")]

    companies = []
    for _, s in score.iterrows():
        cid = int(s[KEY])
        m = master[master[KEY] == cid].iloc[0]
        f = feat[feat[KEY] == cid].iloc[0]

        rev = col_year_map(master, "매출액")
        rev_latest = pd.to_numeric(m[rev[max(rev)]], errors="coerce") if rev else None

        # 데이터 품질: 재무 핵심 연도 결측 체크
        missing = []
        for hint in ["매출액", "영업이익손실", "자본총계"]:
            ym = col_year_map(master, hint)
            for y, c in ym.items():
                if pd.isna(pd.to_numeric(m[c], errors="coerce")):
                    missing.append(f"{hint}_{y}")

        companies.append({
            "id": cid,
            "name": f"기업 {cid}",  # 비식별 데이터라 일련번호 표기
            "industry": clean(m[ind_col]) if ind_col else None,
            "industryCode": clean(m[ksic_col]) if ksic_col else None,
            "region": clean(m[region_col]) if region_col else None,
            "revenueLatest": clean(rev_latest),
            "scores": {a: clean(s.get(f"{a}점수")) for a in AXES},
            "percentiles": {c.replace("pct_", ""): clean(s[c]) for c in pct_cols},
            "rawMetrics": {c: clean(f[c]) for c in feat.columns if c != KEY},
            "trends": {
                "매출액": trend(m, master, "매출액"),
                "영업이익률": trend(m, master, "영업이익률"),
                "부채총계": trend(m, master, "부채총계"),
                "자본총계": trend(m, master, "자본총계"),
            },
            "certifications": {c: yn(m[mcol(c)]) if mcol(c) else False for c in CERTS},
            "patents": {
                "등록": clean(pd.to_numeric(m.get(col_year_map(master, "특허등록건수").get(2024, "")), errors="coerce")) if col_year_map(master, "특허등록건수") else None,
                "출원": clean(pd.to_numeric(m.get(col_year_map(master, "특허출원건수").get(2024, "")), errors="coerce")) if col_year_map(master, "특허출원건수") else None,
            },
            "ntis": {"주관": clean(m.get("NTIS주관_행수")), "위탁": clean(m.get("NTIS위탁_행수"))},
            "support": {
                "건수": clean(m.get("지원건수")),
                "총지원금_천원": clean(m.get("총지원금_천원")),
                "지원연도수": clean(m.get("지원연도수")),
            },
            "supportHistory": support_history(cid, sr),
            "passthrough": {
                "영업외손익비중": clean(s.get("영업외손익비중")),
                "자본잠식_플래그": clean(s.get("자본잠식_플래그")),
            },
            "percentileBasis": clean(s.get("백분위기준")),
            "dataQuality": {"missing": missing, "ok": len(missing) == 0},
            "_mock": ["businessFit"],  # 목업 표기(투명성) — 사업목적 정합성만 아직 미구현
        })

    # 반복선정 랭킹 (건수/금액 분리) — 실 집계
    rank_base = [{"id": c["id"], "name": c["name"], "industry": c["industry"],
                  "건수": c["support"]["건수"], "총지원금_천원": c["support"]["총지원금_천원"]}
                 for c in companies]
    rankings = {
        "byCount": sorted(rank_base, key=lambda x: (x["건수"] or 0), reverse=True),
        "byAmount": sorted(rank_base, key=lambda x: (x["총지원금_천원"] or 0), reverse=True),
    }

    # 대시보드 집계 — 사업유형 분포(실 지원이력 기반)·지역 분포·데이터품질
    from collections import Counter
    biz_counter, region_counter = Counter(), Counter()
    result_counter = Counter()
    for c in companies:
        if c["region"]:
            region_counter[c["region"]] += 1
        for h in c["supportHistory"]:
            biz_counter[h["bizType"]] += 1
            result_counter[h["result"]] += 1
    dashboard = {
        "totalCompanies": len(companies),
        "bizTypeDist": [{"type": k, "count": v} for k, v in biz_counter.most_common()],
        "regionDist": [{"region": k, "count": v} for k, v in region_counter.most_common()],
        "resultDist": [{"result": k, "count": v} for k, v in result_counter.items()],
        "dataQualityIssues": sum(len(c["dataQuality"]["missing"]) for c in companies),
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, data in [("companies", companies), ("rankings", rankings), ("dashboard", dashboard)]:
        (OUT_DIR / f"{name}.json").write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  ✓ {name}.json ({OUT_DIR / f'{name}.json'})")
    print(f"\n✅ fixture {len(companies)}개 기업 생성 완료")


if __name__ == "__main__":
    main()

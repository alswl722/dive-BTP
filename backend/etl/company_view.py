"""master_table/features_finance/features_score/support_records → Company/Rankings/Dashboard dict.

parquet(export_fixtures.py, 오프라인 fixture 생성)과 DB(backend/app/services/companies.py,
실API)가 이 모듈의 build_* 함수를 공유한다. 소스가 parquet든 Postgres든 pandas.DataFrame
4개(score/feat/master/sr)만 맞춰서 넘기면 동일한 JSON 구조가 나온다 — 조립 로직은 한 곳에만
존재(export_fixtures.py에서 검증된 그대로 옮김).
"""

from __future__ import annotations

import math
import re
import sys
from collections import Counter
from pathlib import Path

import pandas as pd

# axis8/axis9 서비스 import (Phase 5b) — app 패키지가 sys.path에 있어야 함
_APP_PARENT = Path(__file__).resolve().parents[1]  # backend/
if str(_APP_PARENT) not in sys.path:
    sys.path.insert(0, str(_APP_PARENT))
from app.services import axis8 as axis8_svc  # noqa: E402
from app.services import axis8_llm as axis8_llm_svc  # noqa: E402
from app.services import axis9 as axis9_svc  # noqa: E402

KEY = "기업일련번호"
CERTS = ["이노비즈", "메인비즈", "벤처기업", "소재부품", "NET", "NEP"]
AXES = ["성장성", "수익성", "효율성", "안정성"]
RESULT_MAP = {"지원대상": "선정", "탈락": "탈락", "포기": "포기"}
GROWTH_SCORE_COL = "성장성점수"  # 축1(민지) 산출 컬럼명 — axis9 성장률 판정에 사용


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
            "programCode": clean(r["program_code"]),
            "year": clean(int(r["year"])) if pd.notna(r["year"]) else None,
        })
    records.sort(key=lambda x: x["date"], reverse=True)
    return records


# ============================================================
# 축8 (사업정체성 정합성) — 지원사업별 판정 → 종합 요약
# ============================================================
_MATCH_TYPE_ORDER = ["직접일치", "간접관련", "무관", "판단유보"]


def _summarize_business_fit(judgments: list[dict], company_id: int) -> dict:
    """개별 판정 리스트 → BusinessFit 종합 dict."""
    breakdown = {mt: 0 for mt in _MATCH_TYPE_ORDER}
    for j in judgments:
        breakdown[j["matchType"]] = breakdown.get(j["matchType"], 0) + 1

    total = len(judgments)
    total_pending = breakdown["판단유보"]
    total_judged = total - total_pending

    # 대표 판정 = 판정 완료분 중 최빈값 (판단유보 제외)
    if total_judged > 0:
        judged_breakdown = {k: v for k, v in breakdown.items() if k != "판단유보"}
        rep_match_type = max(judged_breakdown, key=judged_breakdown.get)
    else:
        rep_match_type = "판단유보"

    # 평균 점수 (score 있는 것만)
    scored = [j["score"] for j in judgments if j.get("score") is not None]
    avg_score = sum(scored) / len(scored) if scored else None

    # 자연어 요약
    if total == 0:
        summary = "받은 지원 없음"
    elif total_pending == total:
        summary = f"지원 {total}건 전체 LLM 판정 대기"
    elif total_pending > 0:
        parts = [f"{k} {v}건" for k, v in breakdown.items() if v > 0 and k != "판단유보"]
        summary = f"{total}건 중 {', '.join(parts)} · {total_pending}건 판정 대기"
    else:
        parts = [f"{k} {v}건" for k, v in breakdown.items() if v > 0]
        summary = f"{total}건 정합성 판정: {', '.join(parts)}"

    return {
        "score": round(avg_score, 1) if avg_score is not None else None,
        "matchType": rep_match_type,
        "summary": summary,
        "totalJudged": total_judged,
        "totalPending": total_pending,
        "breakdown": breakdown,
        "judgments": judgments,
    }


def build_business_fit(
    cid: int,
    ksic_code: str | None,
    sr: pd.DataFrame,
    sp: pd.DataFrame | None,
    whitelist: dict,
    accept: set[str],
    purposes: list[str] | None = None,
    llm_cache: dict | None = None,
) -> dict | None:
    """축8: 지원사업별 정합성 판정 종합.

    - whitelist 통과 → source="whitelist" · score=100
    - 미통과 & LLM 캐시에 있음 → source="llm" · 캐시된 판정 반환
    - 미통과 & 캐시 없음 → source="pending" (배치 미실행 상태)
    - 결측 → source="pending"
    """
    records = sr[(sr["company_id"] == cid) & (sr["selection_result"] == "지원대상")]
    if records.empty:
        return None

    purposes_hash = axis8_llm_svc.hash_purposes(purposes or []) if purposes else ""

    # 프로그램 메타(name/description) 조인용
    prog_lookup = {}
    if sp is not None:
        for _, r in sp.iterrows():
            key = (int(r["year"]) if pd.notna(r.get("year")) else None,
                   str(r["program_code"]) if pd.notna(r.get("program_code")) else None)
            prog_lookup[key] = {
                "name": clean(r.get("program_name")),
                "description": clean(r.get("description")),
            }

    judgments: list[dict] = []
    for _, r in records.iterrows():
        bt = clean(r.get("business_type"))
        result = axis8_svc.classify_alignment(ksic_code, bt, whitelist, accept)

        year = int(r["year"]) if pd.notna(r.get("year")) else 0
        pcode = str(r["program_code"]) if pd.notna(r.get("program_code")) else ""
        prog = prog_lookup.get((year, pcode), {})

        if result.status == "whitelisted":
            match_type = "직접일치"
            score = 100.0
            source = "whitelist"
            keywords = [ksic_code[0] if ksic_code else "", bt or ""]
            reasoning = f"관측 기반 정합 (신뢰도 {result.confidence})"
        elif result.status in ("undetermined", "unknown_ksic"):
            # LLM 캐시 조회
            cache_hit = None
            if llm_cache is not None:
                cache_hit = llm_cache.get((cid, pcode, purposes_hash))
            if cache_hit:
                match_type = cache_hit["match_type"]
                score = float(cache_hit["score"]) if cache_hit["score"] is not None else None
                source = "llm"
                keywords = cache_hit["matched_keywords"]
                reasoning = cache_hit["reasoning"]
            else:
                match_type = "판단유보"
                score = None
                source = "pending"
                keywords = []
                reasoning = "LLM 시맨틱 판정 대기"
        else:  # missing_input
            match_type = "판단유보"
            score = None
            source = "pending"
            keywords = []
            reasoning = "지원사업 데이터 부족"

        judgments.append({
            "programCode": pcode,
            "year": year,
            "programName": prog.get("name"),
            "businessType": bt,
            "score": score,
            "matchType": match_type,
            "matchedKeywords": [k for k in keywords if k],
            "reasoning": reasoning,
            "source": source,
        })

    return _summarize_business_fit(judgments, cid)


# ============================================================
# 축9 (BTP 지원이력 flag) — 배치 계산 후 기업별 lookup
# ============================================================
def _prepare_axis9_batch(sr: pd.DataFrame, score_df: pd.DataFrame) -> tuple[pd.DataFrame, dict[int, dict]]:
    """전 기업 axis9 metrics + flag 판정 배치. 반환: (metrics_df, flags_by_id)."""
    # support_records를 axis9 서비스가 기대하는 컬럼명으로 매핑
    sr_selected = sr[sr["selection_result"] == "지원대상"].copy()
    if sr_selected.empty:
        return pd.DataFrame(), {}

    # axis9.compute_support_metrics는 company_id, year, business_type, support_amount_thousand_krw, program_code 컬럼 요구
    # DB에서 온 sr은 이미 그 이름 사용
    metrics_df = axis9_svc.compute_support_metrics(sr_selected)

    # 성장률 신호 조립: features_score의 성장성점수를 growth_score로 사용 (docs/성장률_인터페이스.md)
    growth_signals: dict[int, axis9_svc.GrowthSignal] = {}
    if GROWTH_SCORE_COL in score_df.columns:
        for _, row in score_df.iterrows():
            cid = int(row[KEY])
            score_val = row.get(GROWTH_SCORE_COL)
            growth_signals[cid] = axis9_svc.GrowthSignal(
                company_id=cid,
                growth_score=None if pd.isna(score_val) else float(score_val),
                revenue_cagr=None,
                revenue_delta=None,
            )

    config = axis9_svc.load_config()
    flag_df = axis9_svc.classify_flags_batch(metrics_df, growth_signals, config)
    seg_df = axis9_svc.classify_segments(metrics_df, config)

    # 기업별 dict 조합
    flags_by_id: dict[int, dict] = {}
    metrics_lookup = metrics_df.set_index("company_id").to_dict("index")
    flags_lookup = flag_df.set_index("company_id").to_dict("index")
    segs_lookup = seg_df.set_index("company_id").to_dict("index")

    for cid in metrics_lookup:
        m = metrics_lookup[cid]
        f = flags_lookup.get(cid, {})
        s = segs_lookup.get(cid, {})
        flags_by_id[cid] = {
            "status": f.get("flag") or "unknown",
            "label": f.get("flag_label") or "성장률 미제공",
            "isRepeat": bool(f.get("is_repeat", False)),
            "growthState": f.get("growth_state") or "unknown",
            "segment": s.get("segment"),
            "isHighDiversity": bool(s.get("is_high_diversity", False)),
            "supportCount": int(m.get("support_count", 0)),
            "totalAmountThousand": float(m.get("total_amount_thousand_krw", 0.0)),
            "businessTypeDiversity": int(m.get("business_type_diversity", 0)),
            "maxConsecutiveYears": int(m.get("max_consecutive_years", 0)),
        }
    return metrics_df, flags_by_id


def build_companies(
    score: pd.DataFrame,
    feat: pd.DataFrame,
    master: pd.DataFrame,
    sr: pd.DataFrame,
    sp: pd.DataFrame | None = None,
    bp: pd.DataFrame | None = None,
    llm_cache: dict | None = None,
) -> list[dict]:
    def mcol(hint):
        return next((c for c in master.columns if hint in str(c)), None)

    ind_col, region_col, ksic_col = mcol("업종명"), mcol("지역"), mcol("KSIC")
    pct_cols = [c for c in score.columns if c.startswith("pct_")]

    # 축8·축9 사전 준비 (배치)
    whitelist = axis8_svc.load_whitelist()
    accept_conf = axis8_svc.load_accept_confidence()
    _, axis9_flags = _prepare_axis9_batch(sr, score)

    # 기업별 사업목적 lookup
    purposes_by_id: dict[int, list[str]] = {}
    if bp is not None and not bp.empty:
        for cid_g, sub in bp.groupby("company_id"):
            purposes_by_id[int(cid_g)] = sub["purpose_text"].dropna().tolist()

    companies = []
    for _, s in score.iterrows():
        cid = int(s[KEY])
        m = master[master[KEY] == cid].iloc[0]
        f = feat[feat[KEY] == cid].iloc[0]

        rev = col_year_map(master, "매출액")
        rev_latest = pd.to_numeric(m[rev[max(rev)]], errors="coerce") if rev else None

        salary = col_year_map(master, "1인평균연간급여")
        salary_latest = pd.to_numeric(m[salary[max(salary)]], errors="coerce") if salary else None

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
            # CLAUDE.md 알려진 이슈: 1인평균연간급여 원본 단위는 "원"(다른 재무지표는 "천원") → /1000으로
            # 스케일 통일해서 revenueLatest 등과 같은 "_천원" 관례로 맞춘다.
            "avgSalaryLatest": clean(salary_latest / 1000) if salary_latest is not None and pd.notna(salary_latest) else None,
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
            "businessFit": build_business_fit(
                cid, clean(m[ksic_col]) if ksic_col else None,
                sr, sp, whitelist, accept_conf,
                purposes=purposes_by_id.get(cid, []),
                llm_cache=llm_cache,
            ),
            "duplicateFlag": axis9_flags.get(cid),
            "_mock": _compute_mock_flags(build_business_fit_result=None),
        })

    # 축8 결과를 회수해서 _mock 재산정 (LLM 대기 케이스만 표기)
    for c in companies:
        c["_mock"] = _compute_mock_flags(c.get("businessFit"))
    return companies


def _compute_mock_flags(build_business_fit_result: dict | None) -> list[str]:
    """`_mock` 투명성 배지 결정.

    - LLM 판정 대기(pending)가 있으면 "businessFit.llm" 표기
    - 전부 whitelist 통과면 표기 없음
    - businessFit=None(지원 없음)이면 표기 없음
    """
    if build_business_fit_result and build_business_fit_result.get("totalPending", 0) > 0:
        return ["businessFit.llm"]
    return []


def build_rankings(companies: list[dict]) -> dict:
    """반복선정 랭킹 (건수/금액 분리) — 실 집계."""
    rank_base = [{"id": c["id"], "name": c["name"], "industry": c["industry"],
                  "건수": c["support"]["건수"], "총지원금_천원": c["support"]["총지원금_천원"]}
                 for c in companies]
    return {
        "byCount": sorted(rank_base, key=lambda x: (x["건수"] or 0), reverse=True),
        "byAmount": sorted(rank_base, key=lambda x: (x["총지원금_천원"] or 0), reverse=True),
    }


def build_dashboard(companies: list[dict]) -> dict:
    """대시보드 집계 — 사업유형 분포(실 지원이력 기반)·지역 분포·데이터품질."""
    biz_counter, region_counter, result_counter = Counter(), Counter(), Counter()
    for c in companies:
        if c["region"]:
            region_counter[c["region"]] += 1
        for h in c["supportHistory"]:
            biz_counter[h["bizType"]] += 1
            result_counter[h["result"]] += 1
    return {
        "totalCompanies": len(companies),
        "bizTypeDist": [{"type": k, "count": v} for k, v in biz_counter.most_common()],
        "regionDist": [{"region": k, "count": v} for k, v in region_counter.most_common()],
        "resultDist": [{"result": k, "count": v} for k, v in result_counter.items()],
        "dataQualityIssues": sum(len(c["dataQuality"]["missing"]) for c in companies),
    }

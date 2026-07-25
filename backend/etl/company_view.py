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
from app.services import composite_score as composite_svc  # noqa: E402

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


def trend(df_row, df, hint, ymap=None):
    """ymap을 넘기면 col_year_map(df, hint) 재계산을 건너뛴다(호출부가 기업마다 반복될 때 유용)."""
    if ymap is None:
        ymap = col_year_map(df, hint)
    return [{"year": y, "value": clean(pd.to_numeric(df_row[c], errors="coerce"))}
            for y, c in ymap.items()]


def employment_series(m, master):
    """연도별 국민연금 가입/취업/퇴직 → [{year, 가입, 취업, 퇴직}]. 고용 배지 펼침표 원천.

    master_table에 국민연금 컬럼이 없으면(뷰 미확장 환경) None → 프론트가 표를 숨긴다.
    """
    sub = col_year_map(master, "국민연금가입자수")
    if not sub:
        return None
    emp = col_year_map(master, "국민연금취업자수")
    ret = col_year_map(master, "국민연금퇴직자수")

    def at(ymap, y):
        return clean(pd.to_numeric(m[ymap[y]], errors="coerce")) if y in ymap else None

    return [{"year": y, "가입": at(sub, y), "취업": at(emp, y), "퇴직": at(ret, y)}
            for y in sorted(sub)]


def employment_scale_series(m, master):
    """연도별 종업원수·1인평균급여(원) → [{year, 종업원수, 급여_원}]. 고용 탭 트렌드.

    종업원수·급여 둘 중 하나라도 있으면 반환. 둘 다 없으면 None.
    급여는 원본 "원" 단위 그대로(다른 금액과 달라 프론트가 화면 표기 시 만원/억원 환산).
    """
    emp = col_year_map(master, "종업원수")
    sal = col_year_map(master, "1인평균연간급여")
    if not emp and not sal:
        return None
    years = sorted(set(emp) | set(sal))

    def at(ymap, y):
        return clean(pd.to_numeric(m[ymap[y]], errors="coerce")) if y in ymap else None

    return [{"year": y, "종업원수": at(emp, y), "급여_원": at(sal, y)} for y in years]


def nonop_series(m, master):
    """연도별 영업이익·당기순이익(천원) → [{year, 영업이익, 당기순이익}]. 영업외 연명 배지 펼침표.

    "본업 적자(영업<0)인데 최종 흑자(순≥0)"가 어느 해였는지를 심사자가 직접 확인.
    두 컬럼 다 없으면 None. 값은 천원 원본 — 프론트가 억원으로 포맷.
    """
    op = col_year_map(master, "영업이익손실")
    ni = col_year_map(master, "당기순이익손실")
    if not op and not ni:
        return None
    years = sorted(set(op) | set(ni))

    def at(ymap, y):
        return clean(pd.to_numeric(m[ymap[y]], errors="coerce")) if y in ymap else None

    return [{"year": y, "영업이익": at(op, y), "당기순이익": at(ni, y)} for y in years]


def yn(v):
    return str(v).strip().upper() in {"Y", "1", "TRUE", "유", "T"}


def _selection_count(sr: pd.DataFrame) -> int | None:
    """**선정된** 사업 수 = 선정건 중 DISTINCT (year, program_code).

    두 가지를 함께 방어한다.

    1) 패키지 분할 행: 패키지지원은 한 번 선정돼도 세부품목(시제품제작·컨설팅·특허지원 …)
       마다 support_records 행이 따로 생긴다. 행을 세면 한 사업 1회 선정이 3건으로 잡혀
       반복·중복 판정이 과대계상된다(1878: 3행 = B1_1_3 1건, 74개 조합 중 15건이 다행).
    2) 탈락·포기 혼입: "반복**선정**"을 세는 값이므로 선정건(원본 `지원대상`)만 대상으로
       한다. 축9(`compute_support_metrics` 호출 전 `지원대상` 필터)와 같은 기준.

    사업코드가 없는 행은 합칠 근거가 없어 각각 별건으로 센다(임의 병합 금지).
    """
    if sr is None or sr.empty:
        return 0
    selected = sr[sr["selection_result"].astype(str).str.strip() == "지원대상"]
    if selected.empty:
        return 0
    keys = set()
    for i, (_, r) in enumerate(selected.iterrows()):
        code = r.get("program_code")
        year = r.get("year")
        if pd.isna(code) or str(code).strip() == "":
            keys.add(f"__nocode_{i}")
        else:
            y = int(year) if pd.notna(year) else None
            keys.add(f"{y}|{str(code).strip()}")
    return len(keys)


def support_history(cid: int, sr: pd.DataFrame, prog_lookup: dict | None = None):
    """support_records(부산TP 2022~2024_기업지원목록 통합)에서 기업별 실제 지원이력 타임라인.

    선정일(selected_date)이 없으면 시작일(start_date)로 대체. 둘 다 없는 행은
    타임라인에 날짜를 못 매길 근거가 없어 제외(원본 결측 그대로 반영, 임의값 대체 안 함).

    ⚠️ sr은 호출부(build_companies)에서 이미 해당 기업으로 필터된 서브프레임을 받는다
    (기업 수가 커지면 매 호출마다 전체 스캔하는 비용이 커지므로 groupby로 사전 분할).

    prog_lookup: _build_prog_lookup(sp) 결과 — (year, program_code) → {name, description}.
    축8(build_business_fit)과 같은 전역 lookup을 재사용해 programName을 채운다
    (사업코드만으로는 화면에서 어떤 사업인지 알 수 없어 중복/반복 수혜 판정 시 이름이 필요).
    """
    rows = sr
    records = []
    for _, r in rows.iterrows():
        date = r["selected_date"] if pd.notna(r["selected_date"]) else r["start_date"]
        if pd.isna(date):
            continue
        result = RESULT_MAP.get(str(r["selection_result"]).strip(), str(r["selection_result"]).strip())
        amount = pd.to_numeric(r["support_amount_thousand_krw"], errors="coerce")
        year = clean(int(r["year"])) if pd.notna(r["year"]) else None
        program_code = clean(r["program_code"])
        prog_info = (prog_lookup or {}).get((year, program_code)) or {}
        records.append({
            "date": pd.Timestamp(date).strftime("%Y-%m-%d"),
            "result": result,
            "bizType": clean(r["business_type"]) or "기타",
            "amount": clean(amount) or 0,
            "programCode": program_code,
            "programName": prog_info.get("name"),
            "year": year,
            # 수행 기간 — 서로 다른 부서 사업을 '동시에' 받고 있는지(중복 수혜) 판정에 필요.
            # 선정일만으로는 동시성을 알 수 없다. 결측이면 None(임의값 대체 안 함).
            "startDate": pd.Timestamp(r["start_date"]).strftime("%Y-%m-%d") if pd.notna(r.get("start_date")) else None,
            "endDate": pd.Timestamp(r["end_date"]).strftime("%Y-%m-%d") if pd.notna(r.get("end_date")) else None,
            # 지원구분 — 한 사업(선정) 안에서도 여러 지원항목을 동시에 받을 수 있다.
            # support_detail_other는 패키지지원 유형에서만 채워지는 원본 컬럼(그 외는 결측).
            "supportDetailMain": clean(r.get("support_detail_main")),
            "supportDetailOther": clean(r.get("support_detail_other")),
            "supportItem": clean(r.get("support_item")),
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


def _build_prog_lookup(sp: pd.DataFrame | None) -> dict:
    """support_programs → (year, program_code) 키의 name/description lookup.

    sp는 기업 수와 무관한 전역 테이블이라 기업별로 매번 재조립할 필요가 없다
    (build_companies에서 한 번만 만들어 재사용).
    """
    prog_lookup = {}
    if sp is not None:
        for _, r in sp.iterrows():
            key = (int(r["year"]) if pd.notna(r.get("year")) else None,
                   str(r["program_code"]) if pd.notna(r.get("program_code")) else None)
            prog_lookup[key] = {
                "name": clean(r.get("program_name")),
                "description": clean(r.get("description")),
            }
    return prog_lookup


def build_business_fit(
    cid: int,
    ksic_code: str | None,
    sr: pd.DataFrame,
    sp: pd.DataFrame | None,
    whitelist: dict,
    accept: set[str],
    purposes: list[str] | None = None,
    llm_cache: dict | None = None,
    prog_lookup: dict | None = None,
) -> dict | None:
    """축8: 지원사업별 정합성 판정 종합.

    - whitelist 통과 → source="whitelist" · score=100
    - 미통과 & LLM 캐시에 있음 → source="llm" · 캐시된 판정 반환
    - 미통과 & 캐시 없음 → source="pending" (배치 미실행 상태)
    - 결측 → source="pending"

    ⚠️ sr은 호출부에서 이미 해당 기업으로 필터된 서브프레임(support_history와 동일 근거).
    """
    records = sr[sr["selection_result"] == "지원대상"]
    if records.empty:
        return None

    purposes_hash = axis8_llm_svc.hash_purposes(purposes or []) if purposes else ""

    if prog_lookup is None:  # 단독 호출(export_fixtures 등) 호환용 폴백
        prog_lookup = _build_prog_lookup(sp)

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
def _prepare_axis9_batch(
    sr: pd.DataFrame,
    score_df: pd.DataFrame,
    feat_df: pd.DataFrame | None = None,
) -> tuple[pd.DataFrame, dict[int, dict]]:
    """전 기업 axis9 metrics + flag 판정 배치. 반환: (metrics_df, flags_by_id).

    feat_df(features_finance) 옵셔널 — 넘기면 매출_CAGR·매출_증가액이 GrowthSignal에
    조인돼 프론트 성장 판정 근거 카드에서 실측 수치로 표시된다.
    """
    # support_records를 axis9 서비스가 기대하는 컬럼명으로 매핑
    sr_selected = sr[sr["selection_result"] == "지원대상"].copy()
    if sr_selected.empty:
        return pd.DataFrame(), {}

    # axis9.compute_support_metrics는 company_id, year, business_type, support_amount_thousand_krw, program_code 컬럼 요구
    # DB에서 온 sr은 이미 그 이름 사용
    metrics_df = axis9_svc.compute_support_metrics(sr_selected)

    # features_finance에서 CAGR·증가액 lookup (기업일련번호 → (cagr, delta))
    # score_df는 백분위(0~100 성장성점수)만 있고 원 지표는 features_finance에 있어 별도 조인 필요.
    cagr_by_id: dict[int, float] = {}
    delta_by_id: dict[int, float] = {}
    if feat_df is not None and not feat_df.empty and KEY in feat_df.columns:
        for _, row in feat_df.iterrows():
            cid = int(row[KEY])
            c = row.get("매출_CAGR")
            d = row.get("매출_증가액")
            if pd.notna(c):
                cagr_by_id[cid] = float(c)
            if pd.notna(d):
                delta_by_id[cid] = float(d)

    # 성장률 신호 조립: features_score의 성장성점수를 growth_score로 사용 (docs/성장률_인터페이스.md)
    growth_signals: dict[int, axis9_svc.GrowthSignal] = {}
    if GROWTH_SCORE_COL in score_df.columns:
        for _, row in score_df.iterrows():
            cid = int(row[KEY])
            score_val = row.get(GROWTH_SCORE_COL)
            growth_signals[cid] = axis9_svc.GrowthSignal(
                company_id=cid,
                growth_score=None if pd.isna(score_val) else float(score_val),
                revenue_cagr=cagr_by_id.get(cid),
                revenue_delta=delta_by_id.get(cid),
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
        # 성장 판정 원 수치 — 프론트 근거 카드가 임계값(30) 대비 표시. 없으면 None 유지.
        g = growth_signals.get(cid)
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
            "growthScore": g.growth_score if g else None,
            "revenueCagr": g.revenue_cagr if g else None,
            "revenueDelta": g.revenue_delta if g else None,
        }
    return metrics_df, flags_by_id


def _prepare_tech_batch(tech_tables: dict | None) -> dict[int, dict]:
    """기술력 축(축4 R&D·특허 / 축5 인증 / 축6 NTIS / 축4-1 도메인) 일괄 산출.

    반환: {company_id: 지표 dict}. tech_tables가 없으면 빈 dict(기존 호출부 호환).

    ⚠️ 이 배선이 필요한 이유: master_table의 특허/NTIS 집계컬럼은 신뢰할 수 없다.
      - `특허등록건수(최종 누적)`은 실제로 누적이 아니라 그해 flow라 비단조(감소)이고,
        상표권·디자인권이 섞여 있다 → 화면에 특허 0건으로 표시되는 문제.
      - `NTIS주관_행수`는 기준일자 스냅샷 원본 행 수라 한 과제가 여러 번 세어진다(약 2.9배).
    원장(patents/ntis_*)을 직접 집계하는 aggregate_tech가 유일한 신뢰 소스다.
    """
    if not tech_tables:
        return {}
    try:
        import aggregate_tech
        import domain_tech
        import features_tech as ft
        import scoring_tech as st
    except ImportError as e:  # 모듈 없는 환경(프론트 전용 브랜치 등)에서는 조용히 생략
        print(f"  ⚠️ 기술축 모듈 import 실패 — 기술 지표 생략: {e}")
        return {}

    agg = aggregate_tech.build(tech_tables)
    feat = ft.compute_features(agg, tech_tables["company_yearly_metrics"],
                               tech_tables["companies"], verbose=False)
    scores = st.compute_scores(feat, st._align_ksic(feat, tech_tables["companies"]))
    domain = domain_tech.build(tech_tables)

    cid_col = aggregate_tech.KEY  # "company_id"
    merged = feat.set_index(cid_col)
    for extra in (scores, domain):
        e = extra.set_index(cid_col)
        e = e[[c for c in e.columns if c not in merged.columns]]  # 중복 컬럼 제외
        merged = merged.join(e)

    out = {int(cid): row.to_dict() for cid, row in merged.iterrows()}

    # 드릴다운용 특허 원장 — "등록 19건"의 근거를 담당자가 직접 확인할 수 있게.
    # 집계와 같은 기준(기술 IP만)으로 필터해 화면 숫자와 목록이 어긋나지 않게 한다.
    pat = tech_tables.get("patents")
    if pat is not None and not pat.empty:
        tech_ip = pat[pat["ip_type"].isin(aggregate_tech.IP_TECH)]
        for cid, g in tech_ip.groupby(cid_col):
            rows = []
            for _, r in g.iterrows():
                rows.append({
                    "type": clean(r.get("ip_type")),
                    "status": clean(r.get("reg_status")),
                    "applied": str(r["applied_date"]) if pd.notna(r.get("applied_date")) else None,
                    "registered": str(r["registered_date"]) if pd.notna(r.get("registered_date")) else None,
                    "valid": bool(r["is_valid"]) if pd.notna(r.get("is_valid")) else None,
                    # 회사와의관계코드(본인/대표이사/임원) — 개인 명의 IP 식별용
                    "relation": clean(r.get("relation_code")),
                })
            rows.sort(key=lambda x: x["applied"] or "", reverse=True)
            if int(cid) in out:
                out[int(cid)]["_patentList"] = rows
    return out


def _split_list(v) -> list[str]:
    """'A; B' 형태 문자열 → 리스트. 결측이면 빈 리스트."""
    v = clean(v)
    return [x for x in str(v).split("; ") if x] if v else []


def _tech_block(t: dict) -> dict:
    """기술축 산출 dict → API 응답용 구조."""
    return {
        "patents": {
            "출원": clean(t.get("특허출원_건수")),
            "등록": clean(t.get("특허등록_건수")),
            "등록전환율": clean(t.get("특허등록전환율")),
            "최근3년출원": clean(t.get("특허_최근출원건수")),
            "최근출원비중": clean(t.get("특허_최근출원비중")),
            "활동공백년수": clean(t.get("특허_활동공백년수")),
            "소멸률": clean(t.get("특허소멸률")),
            "첫특허업력": clean(t.get("첫특허_업력")),
            "대표개인명의_등록": clean(t.get("대표개인명의_등록특허_건수")),
        },
        "rnd": {
            "집약도": clean(t.get("R&D집약도")),
            "집약도추세": clean(t.get("R&D집약도추세")),
        },
        "ntis": {
            "주관과제수": clean(t.get("NTIS주관_과제수")),
            "정부연구비_원": clean(t.get("NTIS주관_정부연구비")),
            "민간연구비_원": clean(t.get("NTIS주관_민간연구비")),
            "민간부담률": clean(t.get("NTIS주관_민간부담률")),
            "최근수주연도": clean(t.get("NTIS주관_최근수주연도")),
            "진행중과제수": clean(t.get("NTIS주관_진행중과제수")),
            "부처다양성": clean(t.get("NTIS주관_부처다양성")),
            "위탁과제수": clean(t.get("NTIS위탁_과제수")),
            "산학협력": bool(t.get("산학협력_여부")),
        },
        "certification": {
            "보유수": clean(t.get("인증_보유수")),
            "핵심보유": bool(t.get("인증_핵심보유")),
            "실체괴리": bool(t.get("인증실체괴리_플래그")),
        },
        "domain": {
            "주력기술분야": clean(t.get("주력기술분야")),
            "출처": clean(t.get("도메인_출처")),
            "분야수": clean(t.get("기술분야_수")),
            "집중도": clean(t.get("기술집중도")),
            "btp중점사업": _split_list(t.get("BTP중점사업")),
            "국가전략기술": _split_list(t.get("국가전략기술")),
            "기술수준등급": clean(t.get("기술수준등급")),
            # 부산 9대 지역전략산업 매칭 (docs/지역적합_설계노트.md)
            "지역전략산업": clean(t.get("지역전략산업")),
            "지역전략산업_매칭유형": clean(t.get("지역전략산업_매칭유형")),  # 고유(강함) | 공통(약함) | None
            "지역전략산업_부합": bool(t.get("지역전략산업_부합")),
        },
        "scores": {
            "rndPatent": clean(t.get("R&D특허점수")),
            "ntis": clean(t.get("NTIS점수")),
            "백분위기준": clean(t.get("백분위기준")),
        },
        # 지표별 동종 대비 백분위(0~100). 절대값만으로는 "많은 건지" 알 수 없어
        # 담당자가 판단하기 어렵다 — "동종 상위 N%"를 함께 보여주기 위함.
        # ⚠️ 백분위기준이 '전체fallback'이면 동종 표본 부족이라는 뜻(화면에 표기).
        "percentiles": {
            "특허출원": clean(t.get("pct_특허출원_건수")),
            "특허등록": clean(t.get("pct_특허등록_건수")),
            "등록전환율": clean(t.get("pct_특허등록전환율")),
            "최근출원비중": clean(t.get("pct_특허_최근출원비중")),
            "R&D집약도": clean(t.get("pct_R&D집약도")),
            "NTIS과제수": clean(t.get("pct_NTIS주관_과제수")),
            "NTIS연구비": clean(t.get("pct_NTIS주관_정부연구비")),
        },
        # 드릴다운 — "등록 N건"의 근거. 화면 숫자와 같은 기준(기술 IP만)으로 필터됨.
        "patentList": t.get("_patentList") or [],
    }


def build_companies(
    score: pd.DataFrame,
    feat: pd.DataFrame,
    master: pd.DataFrame,
    sr: pd.DataFrame,
    sp: pd.DataFrame | None = None,
    bp: pd.DataFrame | None = None,
    llm_cache: dict | None = None,
    tech_tables: dict | None = None,
) -> list[dict]:
    def mcol(hint):
        return next((c for c in master.columns if hint in str(c)), None)

    ind_col, region_col, ksic_col = mcol("업종명"), mcol("지역"), mcol("KSIC")
    size_col = mcol("기업규모")
    pct_cols = [c for c in score.columns if c.startswith("pct_")]

    # 기업규모 정합성 판정 SSOT — EDA(scripts/eda_company_size.py)와 같은 원본 공유.
    import company_size_checks as size_chk
    _emp_cols = col_year_map(master, "종업원수")
    _rev_cols = col_year_map(master, "매출액")
    _asset_cols = col_year_map(master, "자산총계")
    # 재무 신고 불일치 판정 SSOT — EDA(finance_recovery)와 같은 원본 공유. 영업이익률 ymap은
    # 아래 trend_ymaps["영업이익률"]로도 있으나, 정의 순서상 여기서 직접 준비.
    import finance_recovery as fin_chk
    _op_cols = col_year_map(master, "영업이익손실")
    _opm_cols = col_year_map(master, "영업이익률")

    # 축8·축9 사전 준비 (배치)
    whitelist = axis8_svc.load_whitelist()
    accept_conf = axis8_svc.load_accept_confidence()
    _, axis9_flags = _prepare_axis9_batch(sr, score, feat_df=feat)
    # 축4·5·6 + 도메인 (원장 기반 — master 집계컬럼 대체)
    tech_by_id = _prepare_tech_batch(tech_tables)
    # 종합점수 config — 배치 전체에서 한 번만 로드
    composite_weights = composite_svc.load_weights()

    # 기업별 사업목적 lookup
    purposes_by_id: dict[int, list[str]] = {}
    if bp is not None and not bp.empty:
        for cid_g, sub in bp.groupby("company_id"):
            purposes_by_id[int(cid_g)] = sub["purpose_text"].dropna().tolist()

    # 기업 수가 커지면(1,200+) 매 행마다 master/feat 전체를 스캔하는 == 필터가 O(n²)로
    # 느려진다 — KEY로 인덱싱해 기업당 O(1) 조회로 바꾼다(원본 df는 건드리지 않도록 복사 없이 뷰만 생성).
    master_by_id = master.set_index(KEY, drop=False)
    feat_by_id = feat.set_index(KEY, drop=False)

    # support_records도 같은 이유로 기업당 == 필터가 반복되면 O(n²) — company_id로
    # 한 번에 groupby해서 기업별 서브프레임을 미리 준비해둔다.
    sr_by_id: dict[int, pd.DataFrame] = {
        int(cid_g): sub for cid_g, sub in sr.groupby("company_id")
    }
    _empty_sr = sr.iloc[0:0]  # 지원이력 없는 기업용 빈 서브프레임(컬럼 스키마 유지)

    # col_year_map은 master 컬럼명만 훑는 순수 함수라 기업 수와 무관하게 결과가 같다.
    # 루프 안에서 기업마다 재계산하면 낭비이므로 한 번만 계산해 재사용한다.
    rev_ymap = col_year_map(master, "매출액")
    salary_ymap = col_year_map(master, "1인평균연간급여")
    missing_ymaps = {hint: col_year_map(master, hint) for hint in ["매출액", "영업이익손실", "자본총계"]}
    patent_reg_ymap = col_year_map(master, "특허등록건수")
    patent_app_ymap = col_year_map(master, "특허출원건수")
    trend_ymaps = {hint: col_year_map(master, hint) for hint in ["매출액", "영업이익률", "부채총계", "자본총계"]}
    cert_cols = {c: mcol(c) for c in CERTS}  # mcol도 master 컬럼명만 훑는 순수 함수 — 기업마다 재탐색 불필요
    prog_lookup = _build_prog_lookup(sp)  # 축8 프로그램명 조인용 — 전역 lookup, 기업마다 재조립 불필요

    companies = []
    for _, s in score.iterrows():
        cid = int(s[KEY])
        # score에는 있지만 master/feat ETL 단계에서 빠진 기업일 수 있다(본선 데이터가
        # 샘플과 커버리지가 다를 때 특히). .loc[]는 없으면 KeyError로 배치 전체를
        # 죽이므로, 해당 기업만 건너뛰고 계속 진행한다.
        if cid not in master_by_id.index or cid not in feat_by_id.index:
            print(f"  ⚠️ 기업 {cid}: master/feat 커버리지 없음 — 건너뜀")
            continue
        m = master_by_id.loc[cid]
        if isinstance(m, pd.DataFrame):  # KEY 중복 행 존재 시 첫 행 사용(기존 .iloc[0]와 동일 동작)
            m = m.iloc[0]
        f = feat_by_id.loc[cid]
        if isinstance(f, pd.DataFrame):
            f = f.iloc[0]
        _t = tech_by_id.get(cid)  # 기술축 산출(없으면 None → master 폴백)
        sr_c = sr_by_id.get(cid, _empty_sr)  # 이 기업의 지원이력 서브프레임(전체 스캔 회피)

        rev_latest = pd.to_numeric(m[rev_ymap[max(rev_ymap)]], errors="coerce") if rev_ymap else None

        salary_latest = pd.to_numeric(m[salary_ymap[max(salary_ymap)]], errors="coerce") if salary_ymap else None

        # 기업 기본 상태 — master_table이 기업정보 시트의 원본 한글 컬럼을 그대로 담는다.
        # 컬럼명이 뷰마다 다를 수 있어 방어적으로 조회(없으면 None). 자본금은 연도별 중 최신.
        founded_col = mcol("설립일자")
        status_col = next((c for c in master.columns if str(c) == "기업상태"), None)  # '_휴폐업여부' 등과 구분
        closed_col = next((c for c in master.columns if "휴폐업여부" in str(c)), None)
        closure_col = next((c for c in master.columns if "휴폐업구분" in str(c)), None)
        # 상장/외감 구분 — 원본 헤더는 "기업공개(코스피,코스닥)"이나 값은 상장구분(코스피/코스닥)
        # 또는 외부감사구분(외감/일반법인)이 섞여 온다(소스 헤더≠내용). 값 그대로 전달하고 해석은 프론트에서.
        listing_col = next((c for c in master.columns if "기업공개" in str(c)), None)
        cap = col_year_map(master, "납입자본금")
        cap_latest = pd.to_numeric(m[cap[max(cap)]], errors="coerce") if cap else None
        founded = m[founded_col] if founded_col else None

        # 데이터 품질: 재무 핵심 연도 결측 체크
        missing = []
        for hint, ym in missing_ymaps.items():
            for y, c in ym.items():
                if pd.isna(pd.to_numeric(m[c], errors="coerce")):
                    missing.append(f"{hint}_{y}")

        # 데이터 품질: 신고값 vs 실측 정합성(값은 안 고침 — 사실만 밝힘). 규모/재무 2종을
        # category 태깅해 한 리스트로 합친다(프론트가 배지를 종류별로 나눠 렌더).
        size_incons = size_chk.check_company_size(
            clean(m[size_col]) if size_col else None,
            clean(m[ksic_col]) if ksic_col else None,
            size_chk.latest_valid({y: pd.to_numeric(m[c], errors="coerce") for y, c in _emp_cols.items()}),
            size_chk.recent3_mean({y: pd.to_numeric(m[c], errors="coerce") for y, c in _rev_cols.items()}),
            size_chk.latest_valid({y: pd.to_numeric(m[c], errors="coerce") for y, c in _asset_cols.items()}),
        )
        # 재무: 신고 영업이익률이 손익(영업이익÷매출)과 어긋나는 기업. 스코어링은 이미 재계산값을
        # 쓰지만 화면은 원본을 그대로 보여주므로, 심사자에게 배지로 경고.
        fin_incons = fin_chk.check_margin_consistency(
            {y: pd.to_numeric(m[c], errors="coerce") for y, c in _op_cols.items()},
            {y: pd.to_numeric(m[c], errors="coerce") for y, c in _rev_cols.items()},
            {y: pd.to_numeric(m[c], errors="coerce") for y, c in _opm_cols.items()},
        )
        inconsistencies = ([{**i, "category": "규모"} for i in size_incons]
                           + [{**i, "category": "재무"} for i in fin_incons])

        business_fit = build_business_fit(
            cid, clean(m[ksic_col]) if ksic_col else None,
            sr_c, sp, whitelist, accept_conf,
            purposes=purposes_by_id.get(cid, []),
            llm_cache=llm_cache,
            prog_lookup=prog_lookup,
        )

        # 종합점수 — 재무4축 + 기술2축(R&D특허/NTIS) + 축8 정합성.
        # 축9(duplicateFlag)는 설계상 역량 스코어 미포함 → 별도 필드로만 병기(docs/축9_설계노트.md).
        composite_axis_scores = {
            **{a: clean(s.get(f"{a}점수")) for a in AXES},
            "R&D특허": clean(_t.get("R&D특허점수")) if _t else None,
            "NTIS": clean(_t.get("NTIS점수")) if _t else None,
            "정합성": business_fit.get("score") if business_fit else None,
        }
        composite = composite_svc.compute_composite_score(cid, composite_axis_scores, composite_weights)

        companies.append({
            "id": cid,
            "name": f"기업 {cid}",  # 비식별 데이터라 일련번호 표기
            "industry": clean(m[ind_col]) if ind_col else None,
            "industryCode": clean(m[ksic_col]) if ksic_col else None,
            "region": clean(m[region_col]) if region_col else None,
            "foundedDate": str(pd.Timestamp(founded).date()) if founded is not None and pd.notna(founded) else None,
            "companyStatus": clean(m[status_col]) if status_col else None,
            "isClosed": bool(m[closed_col]) if closed_col and pd.notna(m[closed_col]) else False,
            "closureType": clean(m[closure_col]) if closure_col else None,
            "capitalThousand": clean(cap_latest),
            "listingType": clean(m[listing_col]) if listing_col else None,  # 상장구분/외감구분(값 그대로)
            "revenueLatest": clean(rev_latest),
            # CLAUDE.md 알려진 이슈: 1인평균연간급여 원본 단위는 "원"(다른 재무지표는 "천원") → /1000으로
            # 스케일 통일해서 revenueLatest 등과 같은 "_천원" 관례로 맞춘다.
            "avgSalaryLatest": clean(salary_latest / 1000) if salary_latest is not None and pd.notna(salary_latest) else None,
            "scores": {a: clean(s.get(f"{a}점수")) for a in AXES},
            "percentiles": {c.replace("pct_", ""): clean(s[c]) for c in pct_cols},
            "rawMetrics": {c: clean(f[c]) for c in feat.columns if c != KEY},
            "trends": {
                "매출액": trend(m, master, "매출액", ymap=trend_ymaps["매출액"]),
                "영업이익률": trend(m, master, "영업이익률", ymap=trend_ymaps["영업이익률"]),
                "부채총계": trend(m, master, "부채총계", ymap=trend_ymaps["부채총계"]),
                "자본총계": trend(m, master, "자본총계", ymap=trend_ymaps["자본총계"]),
            },
            "certifications": {c: yn(m[cert_cols[c]]) if cert_cols[c] else False for c in CERTS},
            # 특허·NTIS는 원장 집계(tech)를 우선 사용. master 집계컬럼은 신뢰 불가
            # (특허=비단조 flow+상표·디자인 혼입 / NTIS=스냅샷 중복). tech 없을 때만 폴백.
            "patents": {
                "등록": clean(_t.get("특허등록_건수")) if _t else
                        (clean(pd.to_numeric(m.get(patent_reg_ymap.get(2024, "")), errors="coerce")) if patent_reg_ymap else None),
                "출원": clean(_t.get("특허출원_건수")) if _t else
                        (clean(pd.to_numeric(m.get(patent_app_ymap.get(2024, "")), errors="coerce")) if patent_app_ymap else None),
            },
            "ntis": {
                "주관": clean(_t.get("NTIS주관_과제수")) if _t else clean(m.get("NTIS주관_행수")),
                "위탁": clean(_t.get("NTIS위탁_과제수")) if _t else clean(m.get("NTIS위탁_행수")),
            },
            "tech": _tech_block(_t) if _t else None,
            # ⚠️ 건수 = 지원 "항목수"(행 수, 패키지 세부품목 포함) / 선정건수 = 실제 선정된 사업 수.
            # 패키지지원은 한 번 선정돼도 세부품목마다 행이 따로 생긴다(1878: 3행 = B1_1_3 1건).
            # 화면 표시는 항목수를 쓰되, 반복·중복수혜 판정은 반드시 선정건수를 쓸 것.
            #
            # 선정건수는 master_table의 뷰 컬럼이 아니라 **support_records에서 직접** 센다:
            # parquet 모드의 master_table.parquet은 DB 뷰의 스냅샷이라 뷰를 고쳐도 재덤프
            # 전까지 컬럼이 없다 → 뷰 값에 의존하면 그동안 조용히 옛 값(행 수)이 나간다.
            # 원장에서 세면 parquet·DB 어느 경로든 항상 같은 값이 나온다(프론트 duplicate-risk도 동일 기준).
            "support": {
                "건수": clean(m.get("지원건수")),
                "선정건수": _selection_count(sr_c),
                "총지원금_천원": clean(m.get("총지원금_천원")),
                "지원연도수": clean(m.get("지원연도수")),
            },
            "supportHistory": support_history(cid, sr_c, prog_lookup),
            "passthrough": {
                "영업외손익비중": clean(s.get("영업외손익비중")),
                "자본잠식_플래그": clean(s.get("자본잠식_플래그")),
                # 영업외손익 괴리 배지용 다년 신호 — 영업<0·순≥0(영업외로 연명)이 5년 중 몇 년인지.
                # 최근연도 부호(rawMetrics)만으론 2379(만성 연명) 같은 과거 다년 패턴을 놓침.
                "영업외의존_연수": clean(s.get("영업외의존_연수")),
                "재무관측연수": clean(s.get("재무관측연수")),
                # 고용 회전율 배지용 — 가입자수만 보면 성장이나 실제 대량 입·퇴사일 수 있음(695).
                "이직률_최근": clean(s.get("이직률_최근")),
                "고용회전율_최근": clean(s.get("고용회전율_최근")),
                "고용순증_최근": clean(s.get("고용순증_최근")),
                "고용관측연수": clean(s.get("고용관측연수")),
            },
            # 고용축 상세 — 스코어 미반영(SCORE_COLS 불변), passthrough + 업종내 백분위로만.
            # 프론트 고용 탭 4개 섹션(규모·처우·생산성·안정성) + 배지 포지션 바 원천.
            # docs/고용회전율_영업외손익_설계노트.md 결정 그대로: 재무 4축 왜곡 없음.
            "employment": {
                # 안정성 (배지 · 국민연금 펼침표)
                "회전율백분위": clean(s.get("고용회전율_백분위")),
                "series": employment_series(m, master),
                # 규모 · 변화
                "종업원수_최근": clean(s.get("종업원수_최근")),
                "종업원수_CAGR": clean(s.get("종업원수_CAGR")),
                "종업원수_증감_5년": clean(s.get("종업원수_증감_5년")),
                "종업원수증가_백분위": clean(s.get("종업원수증가_백분위")),
                # 처우 (급여 단위=원, 원본 그대로 — 프론트가 화면 표기 시 환산)
                "급여_최근_원": clean(s.get("1인평균급여_최근")),
                "급여_CAGR": clean(s.get("1인평균급여_CAGR")),
                "급여_백분위": clean(s.get("급여_백분위")),
                # 인력 생산성 (매출·영업이익은 천원, 종업원수 명 → 결과 단위 = 천원/명)
                "인당매출_최근_천원": clean(s.get("인당매출_최근")),
                "인당매출_백분위": clean(s.get("인당매출_백분위")),
                "인당영업이익_최근_천원": clean(s.get("인당영업이익_최근")),
                # 규모·처우 트렌드 (프론트 스파크라인)
                "scaleSeries": employment_scale_series(m, master),
            },
            # 영업외 연명 배지 상세 — 연도별 영업이익 vs 당기순이익(펼침표).
            "nonopIncome": {
                "series": nonop_series(m, master),
            },
            "percentileBasis": clean(s.get("백분위기준")),
            # ok = '재무 결측 없음'(기존 의미 유지). 프론트 5곳이 !ok를 '재무 결측'으로
            # 등치하므로 불일치를 여기 얹지 않는다 — 불일치는 inconsistencies로 별도 노출.
            "dataQuality": {"missing": missing, "inconsistencies": inconsistencies,
                            "ok": len(missing) == 0},
            "businessFit": business_fit,
            # 심사 스크리닝/정렬용 보조 지표. 축별 breakdown(scores/tech.scores/businessFit.score)이
            # 진짜 판단 근거 — 종합점수만 보고 판단하지 않도록 화면에 항상 함께 노출할 것.
            # (docs/재무축_설계노트.md §5 "종합점수 없음" 원칙 위에 얹은 보조 지표, 그 원칙을 뒤집지 않음)
            "compositeScore": {
                "score": composite.score,
                "rawWeightedAverage": composite.raw_weighted_average,
                "lowestAxis": composite.lowest_axis,
                "lowestAxisScore": composite.lowest_axis_score,
                "validAxisRatio": composite.valid_axis_ratio,
                "breakdown": composite.breakdown,
            },
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
    """반복선정 랭킹 (건수/금액 분리) — 실 집계.

    ⚠️ byCount 정렬 기준은 "선정건수"(선정된 사업 수)다. 행 수(지원 항목수)로 정렬하면
    패키지지원 세부품목이 각각 1건으로 잡혀 반복선정이 과대계상된다(1878: 3행 = 1건 선정).
    "건수"(항목수)는 화면 근거 표시용으로 함께 실어 보낸다.
    """
    rank_base = [{"id": c["id"], "name": c["name"], "industry": c["industry"],
                  "건수": c["support"].get("선정건수") or c["support"]["건수"],
                  "항목수": c["support"]["건수"],
                  "총지원금_천원": c["support"]["총지원금_천원"]}
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

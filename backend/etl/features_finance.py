"""재무 3축 파생컬럼 산출 (성장성·수익성·안정성).

master_table(기업 1행, `기업일련번호` 기준)을 입력받아 기업별 재무 파생컬럼을
계산한다. 모든 비율/CAGR/기울기는 finance_utils의 방어 함수를 사용한다.

구조 (로직 ↔ I/O 분리):
- compute_features(df) -> df : 순수 계산. DB/파일 무관, 테스트 쉬움.
- load_master / save_features : parquet 또는 Postgres 어댑터.
- main() : `--source parquet|db` (기본 parquet).

설계 메모:
- 컬럼명은 하드코딩하지 않고 부분일치로 매핑한다(본선 데이터 컬럼명이 샘플과
  다를 수 있음). '영업이익손실'과 '영업이익률'이 섞이지 않도록 정확한 힌트 사용.
- 연도도 하드코딩하지 않고 실제 매핑된 연도로 동작한다(기업 수·연도 수 무관).
- 절대 임계값·정규화·스코어링은 여기서 하지 않는다(다음 단계).
"""

from __future__ import annotations

import argparse
import os
import re
from pathlib import Path

import numpy as np
import pandas as pd

from finance_utils import safe_cagr, safe_ratio, winsorize, slope

# --- config -----------------------------------------------------------------
KEY = "기업일련번호"

DATA_DIR = Path(__file__).resolve().parent / "data"
MASTER_PARQUET = DATA_DIR / "master_table.parquet"
FEATURES_PARQUET = DATA_DIR / "features_finance.parquet"

# DB 모드 테이블명 (본선 당일 팀원 C 스키마 확정 시 여기만 맞추면 됨)
MASTER_TABLE = "master_table"
FEATURES_TABLE = "features_finance"

# 지표별 부분일치 힌트 (정확 매칭 — '영업이익손실' ≠ '영업이익률')
METRIC_HINTS = {
    "매출액": "매출액",
    "영업이익손실": "영업이익손실",
    "영업이익률": "영업이익률",
    "당기순이익손실": "당기순이익손실",
    "매출원가": "매출원가",
    "자산총계": "자산총계",
    "부채총계": "부채총계",
    "자본총계": "자본총계",
    "납입자본금": "납입자본금",
}


# --- 컬럼 매핑 헬퍼 (기존 EDA find_year_cols 패턴 재사용) --------------------
def norm_cols(df: pd.DataFrame) -> pd.DataFrame:
    """컬럼명 공백/개행 제거."""
    df = df.copy()
    df.columns = [re.sub(r"\s+", "", str(c)) for c in df.columns]
    return df


def find_year_cols(df: pd.DataFrame, hint: str) -> dict:
    """hint의 연도별 컬럼을 {연도: 컬럼명}으로 반환. 2단계 매칭:

    1) **엄격**: 연도 접미사를 제거한 스템이 hint와 정확히 일치('매출액_2020'
       → 스템 '매출액'). '매출액증가율_2024' 같은 파생 컬럼이 진짜 매핑을
       덮어쓰는 사고(연도 키 충돌)를 차단.
    2) **fallback**: 엄격 매칭이 0개면 부분일치(hint in 컬럼명)로 완화하고
       ⚠️ 경고 — 본선 데이터 컬럼명이 장식('(최종건수누적)' 등)을 달고 올 때
       조용히 전멸하지 않기 위한 안전망.

    실제 매핑된 연도만 담기므로 연도 범위가 달라도(본선) 그대로 동작.
    """
    strict, loose = {}, {}
    for c in df.columns:
        s = str(c)
        m = re.search(r"(20\d{2})", s)
        if not m:
            continue
        y = int(m.group(1))
        if hint in s:
            loose[y] = c
        stem = re.sub(r"[_\s]*20\d{2}.*$", "", s)  # 연도 접미사부터 끝까지 제거
        if stem == hint:
            strict[y] = c
    if strict:
        return dict(sorted(strict.items()))
    if loose:
        print(f"  ⚠️ '{hint}' 엄격 매칭 실패 → 부분일치 fallback 사용: "
              f"{list(loose.values())[:3]}{'...' if len(loose) > 3 else ''} — 컬럼명 확인 권장")
        return dict(sorted(loose.items()))
    return {}


def _year_series(df: pd.DataFrame, ycols: dict, year: int) -> pd.Series:
    """지표의 특정 연도 값을 숫자 Series로. 없으면 전부 NaN."""
    col = ycols.get(year)
    if col is None:
        return pd.Series(np.nan, index=df.index)
    return pd.to_numeric(df[col], errors="coerce")


# --- 순수 계산 --------------------------------------------------------------
def compute_features(df: pd.DataFrame, verbose: bool = True) -> pd.DataFrame:
    """master_table DataFrame → 기업별 재무 3축 파생컬럼 DataFrame."""
    df = norm_cols(df)
    if KEY not in df.columns:
        raise KeyError(f"조인 키 '{KEY}' 컬럼이 입력에 없음. 컬럼: {list(df.columns)[:10]}...")

    # 기업일련번호 중복 가드: 중복 행은 백분위·조인을 오염시킴 → 첫 행만 유지 + 경고
    dup = df[KEY].duplicated()
    if dup.any():
        print(f"  ⚠️ {KEY} 중복 {int(dup.sum())}건 감지 → 각 기업 첫 행만 유지 (ETL 중복 적재 여부 확인 필요)")
        df = df[~dup].reset_index(drop=True)

    # 지표별 연도 컬럼 매핑 + 로그
    ymap = {name: find_year_cols(df, hint) for name, hint in METRIC_HINTS.items()}
    if verbose:
        print("[컬럼 매핑] (엄격 → 부분일치 fallback)")
        for name, yc in ymap.items():
            status = ", ".join(f"{y}:{c}" for y, c in yc.items()) or "⚠️ 매칭 없음"
            print(f"  {name:12s} → {status}")
    # 매핑 실패 요약 — 본선 컬럼명 변형의 조용한 전멸 방지 (가장 위험한 단일 실패 지점)
    missing_hints = [n for n, yc in ymap.items() if not yc]
    if missing_hints:
        print(f"  ⚠️⚠️ 매핑 실패 지표 {len(missing_hints)}개: {missing_hints}")
        print(f"       → 관련 파생컬럼이 전부 NaN이 됩니다. METRIC_HINTS와 실제 컬럼명을 대조하세요!")

    def sat(name: str, year: int) -> pd.Series:  # series-at-year
        return _year_series(df, ymap[name], year)

    def years_of(name: str) -> list:
        return sorted(ymap[name].keys())

    def wide(name: str) -> pd.DataFrame:
        """지표의 연도 매트릭스 (기업 × 연도)."""
        return pd.DataFrame({y: sat(name, y) for y in years_of(name)}, index=df.index)

    out = pd.DataFrame({KEY: df[KEY].values}, index=df.index)

    # =========================== 축1 성장성 ===========================
    def growth_block(metric: str):
        """지표의 (CAGR, 성장안정성, 성장가속도)를 반환. 유효 연도 2개 미만이면 전부 NaN."""
        ys = years_of(metric)
        if len(ys) < 2:
            return np.nan, np.nan, np.nan
        W = wide(metric)  # 기업 × 연도
        # 전년대비 성장률(YoY): 시작값 0 방어 → safe_ratio
        yoy = pd.DataFrame(
            {ys[i]: safe_ratio(W[ys[i]], W[ys[i - 1]]) - 1 for i in range(1, len(ys))},
            index=df.index,
        )
        # CAGR: 기업별 첫/끝 "유효" 연도 사용 — 가장자리 1년 결측만으로 전체 NaN이
        # 되는 것 방지(중간 연도로 계산 가능하면 계산, span은 실제 유효연도 차이).
        def _cagr_row(row):
            valid = row.dropna()
            if len(valid) < 2:
                return np.nan
            y0, y1 = valid.index[0], valid.index[-1]
            return safe_cagr(valid.iloc[0], valid.iloc[-1], y1 - y0)
        cagr = W.apply(_cagr_row, axis=1)
        stab = yoy.std(axis=1, skipna=True)  # 낮을수록 안정. 유효 전이 1개면 NaN.
        # 가속도: 최근 구간(마지막 전이) − 이전 구간(앞 2개 전이 평균)
        #   지시서 라벨 그대로: recent=23→24, prior=mean(20→21, 21→22)
        #   유효 전이 < 3개면 NaN — recent·prior 창이 겹치거나(연도 3개) 동일해져
        #   (연도 2개 → 가속도 0) "정보 부족"이 "변화 없음"으로 오독되는 것 방지.
        n_trans = yoy.notna().sum(axis=1)
        accel_raw = yoy.iloc[:, -1] - yoy.iloc[:, :2].mean(axis=1, skipna=True)
        accel = accel_raw.where(n_trans >= 3)
        return cagr, stab, accel

    out["매출_CAGR"], out["매출_성장안정성"], out["매출_성장가속도"] = growth_block("매출액")
    out["자산_CAGR"], out["자산_성장안정성"], out["자산_성장가속도"] = growth_block("자산총계")

    # 매출_증가액: 마지막 유효연도 − 첫 유효연도 (단위 = 매출액과 동일: 천원).
    # CAGR은 비율이라 "얼마나 성장했나"를 감으로만 알려주고, 심사관은 절대금액도 봐야
    # 규모 판단이 서므로 병기(축9 flag 성장 판정 근거 카드에 노출). 유효연도 2개 미만 → NaN.
    def _delta_row(row):
        valid = row.dropna()
        if len(valid) < 2:
            return np.nan
        return float(valid.iloc[-1] - valid.iloc[0])
    rev_years = years_of("매출액")
    out["매출_증가액"] = wide("매출액").apply(_delta_row, axis=1) if len(rev_years) >= 2 else np.nan

    # =========================== 축2 수익성 ===========================
    L = years_of("매출액")[-1] if years_of("매출액") else None  # 최근 연도
    if L is not None:
        out["영업이익률_최근"] = safe_ratio(sat("영업이익손실", L), sat("매출액", L))
        out["순이익률_최근"] = safe_ratio(sat("당기순이익손실", L), sat("매출액", L))
        out["매출총이익률_최근"] = safe_ratio(sat("매출액", L) - sat("매출원가", L), sat("매출액", L))
        # 자본 대비 수익 (매출 기준 마진이 못 잡는 관점): 자산·자기자본이 얼마나 벌어들이나
        # 기준연도는 매출 최신(L)이 아니라 두 지표의 "자체 최신 공통연도" — 매출과
        # 자산·자본의 연도 커버리지가 다를 때 불필요한 NaN 방지.
        def _latest_common(a: str, b: str):
            common = set(ymap[a]) & set(ymap[b])
            return max(common) if common else None
        La = _latest_common("당기순이익손실", "자산총계")
        Le = _latest_common("당기순이익손실", "자본총계")
        out["ROA"] = safe_ratio(sat("당기순이익손실", La), sat("자산총계", La)) if La else np.nan
        out["ROE"] = safe_ratio(sat("당기순이익손실", Le), sat("자본총계", Le)) if Le else np.nan  # 자본≤0→NaN
        # 본업(영업) vs 최종(순이익) 갭 = 영업외손익 비중. 음수 크면 영업외에서 이익을 까먹음.
        out["영업외손익비중"] = out["순이익률_최근"] - out["영업이익률_최근"]
        # 판관비율: 판관비 = 매출총이익 − 영업이익 = (매출−매출원가) − 영업이익
        _sga = (sat("매출액", L) - sat("매출원가", L)) - sat("영업이익손실", L)
        out["판관비율"] = safe_ratio(_sga, sat("매출액", L))
        # 데이터 모순 감지: 판관비 음수(영업이익 > 매출총이익)는 회계상 불가 → 원본 오류 신호.
        # 점수엔 미반영(passthrough), 대시보드 데이터품질 경고용. 1=모순, 0=정상, NaN=판단불가.
        out["데이터모순_판관비음수"] = (_sga < 0).astype(float).where(_sga.notna())
        # 효율성: 자산을 얼마나 매출로 돌리나 (성장·수익과 독립 축)
        out["총자산회전율"] = safe_ratio(sat("매출액", L), sat("자산총계", L))
    else:
        for _c in ["영업이익률_최근", "순이익률_최근", "매출총이익률_최근",
                   "ROA", "ROE", "영업외손익비중", "판관비율",
                   "데이터모순_판관비음수", "총자산회전율"]:
            out[_c] = np.nan

    # 흑자지속성: 관측된 연도 중 영업이익 > 0 인 연수.
    # 관측 0년(전결측)이면 NaN — "데이터 없음"과 "5년 내내 적자"를 구분(결측→0 오인 방지).
    # 흑자관측연수를 병기해 "3년 관측 중 2년 흑자"처럼 분모를 드러냄.
    op_mat = wide("영업이익손실")
    if not op_mat.empty:
        obs_years = op_mat.notna().sum(axis=1)
        black_cnt = (op_mat > 0).sum(axis=1).astype(float)
        out["흑자관측연수"] = obs_years.astype(int)
        out["흑자지속성"] = black_cnt.where(obs_years > 0)
    else:
        out["흑자관측연수"] = 0
        out["흑자지속성"] = np.nan

    # 영업외의존_연수: 영업이익<0 인데 당기순이익≥0 인 연수(= 본업 적자를 영업외로 연명).
    # 영업이익·당기순이익 둘 다 관측된 연도만 분모(재무관측연수). 만성 연명(2379: 4년) 포착용.
    # 점수 미반영(비단조·맥락 신호) → passthrough. 판정은 프론트 배지에서 임계값 적용.
    ni_mat = wide("당기순이익손실")
    if not op_mat.empty and not ni_mat.empty:
        common_yrs = [y for y in op_mat.columns if y in ni_mat.columns]
        if common_yrs:
            op_c, ni_c = op_mat[common_yrs], ni_mat[common_yrs]
            both_obs = (op_c.notna() & ni_c.notna())
            fin_obs = both_obs.sum(axis=1)
            lifeline = ((op_c < 0) & (ni_c >= 0) & both_obs).sum(axis=1).astype(float)
            out["재무관측연수"] = fin_obs.astype(int)
            out["영업외의존_연수"] = lifeline.where(fin_obs > 0)
        else:
            out["재무관측연수"] = 0
            out["영업외의존_연수"] = np.nan
    else:
        out["재무관측연수"] = 0
        out["영업외의존_연수"] = np.nan

    # =========================== 고용축 (점수 미반영 · 맥락) ===========================
    # ⚠️ 재무 4축과 분리 유지 — 성장기업의 정상 대규모 채용을 안정성 감점으로 왜곡하지 않기 위함.
    #    docs/고용회전율_영업외손익_설계노트.md의 결정 그대로. 여기 값들은 전부 passthrough +
    #    맥락 배지(포지션 바)용이지 SCORE_COLS에는 들어가지 않는다.

    # 종업원수·1인평균급여: 프론트 고용 탭의 규모·처우·생산성 카드 원천.
    # find_year_cols 직접 호출(METRIC_HINTS 우회) — validate_scores 전멸 검사의 fatal 대상 아님.
    emp_cnt_map = find_year_cols(df, "종업원수")
    salary_map = find_year_cols(df, "1인평균연간급여")
    emp_years = sorted(emp_cnt_map.keys())
    sal_years = sorted(salary_map.keys())

    def _last_valid_row(ymap: dict, years: list[int]) -> pd.Series:
        """기업별 마지막 유효(비결측) 연도의 값을 뽑는다. 연도 스킵도 허용."""
        if not years:
            return pd.Series(np.nan, index=df.index)
        wide_ = pd.DataFrame({y: _year_series(df, ymap, y) for y in years}, index=df.index)
        # 각 행의 last_valid_index — 유효값 없는 행은 NaN
        return wide_.apply(lambda r: r.dropna().iloc[-1] if r.notna().any() else np.nan, axis=1)

    def _row_cagr(ymap: dict, years: list[int]) -> pd.Series:
        """기업별 CAGR — 유효값 2개 이상, 첫/끝 유효연도 사용(가장자리 결측 방어)."""
        if len(years) < 2:
            return pd.Series(np.nan, index=df.index)
        wide_ = pd.DataFrame({y: _year_series(df, ymap, y) for y in years}, index=df.index)
        def _c(row):
            valid = row.dropna()
            if len(valid) < 2:
                return np.nan
            y0, y1 = valid.index[0], valid.index[-1]
            return safe_cagr(valid.iloc[0], valid.iloc[-1], y1 - y0)
        return wide_.apply(_c, axis=1)

    # 규모 · 변화
    out["종업원수_최근"] = _last_valid_row(emp_cnt_map, emp_years)
    out["종업원수_CAGR"] = _row_cagr(emp_cnt_map, emp_years)
    if len(emp_years) >= 2:
        emp_wide = pd.DataFrame({y: _year_series(df, emp_cnt_map, y) for y in emp_years}, index=df.index)
        def _delta_emp(row):
            valid = row.dropna()
            return float(valid.iloc[-1] - valid.iloc[0]) if len(valid) >= 2 else np.nan
        out["종업원수_증감_5년"] = emp_wide.apply(_delta_emp, axis=1)
    else:
        out["종업원수_증감_5년"] = np.nan

    # 처우
    out["1인평균급여_최근"] = _last_valid_row(salary_map, sal_years)  # 단위=원 (다른 재무는 천원)
    out["1인평균급여_CAGR"] = _row_cagr(salary_map, sal_years)

    # 인력 생산성 — 인당 매출·영업이익. 기업마다 최신 유효연도가 달라 컬럼 기반 공통연도로 잡으면
    # (예: 컬럼상 매출·종업원 둘 다 2024년 있지만 특정 기업의 종업원_2024가 NaN인 케이스)
    # 인당 지표만 NaN이 되어 프론트에서 "—"로 뜨는 버그. 기업별로 두 지표 모두 유효한 최신 연도를
    # 골라 계산한다.
    def _last_common_valid_ratio(num_hint: str, den_ymap: dict) -> pd.Series:
        """기업별 (num, den) 모두 유효한 최신 연도 값으로 num/den 계산.

        공통연도 컬럼 스캔이 아니라 기업 행 단위로 최신 유효연도를 뽑아 NaN 방어.
        """
        num_ymap = ymap[num_hint]
        years_ = sorted(set(num_ymap) & set(den_ymap))
        if not years_:
            return pd.Series(np.nan, index=df.index)
        num_wide = pd.DataFrame({y: sat(num_hint, y) for y in years_}, index=df.index)
        den_wide = pd.DataFrame({y: _year_series(df, den_ymap, y) for y in years_}, index=df.index)
        # 두 값 모두 유효한 연도 마스크
        both = num_wide.notna() & den_wide.notna() & (den_wide != 0)
        # 각 행의 마지막 유효 연도
        last_year = both.where(both).apply(lambda r: r.last_valid_index(), axis=1)
        def _pick(mat: pd.DataFrame) -> pd.Series:
            return pd.Series(
                [mat.at[i, y] if pd.notna(y) else np.nan for i, y in last_year.items()],
                index=df.index,
            )
        return safe_ratio(_pick(num_wide), _pick(den_wide))

    if emp_cnt_map and years_of("매출액"):
        out["인당매출_최근"] = _last_common_valid_ratio("매출액", emp_cnt_map)         # 천원/명
    else:
        out["인당매출_최근"] = np.nan

    if emp_cnt_map and years_of("영업이익손실"):
        out["인당영업이익_최근"] = _last_common_valid_ratio("영업이익손실", emp_cnt_map)  # 천원/명
    else:
        out["인당영업이익_최근"] = np.nan

    # 고용 회전율: 국민연금 취업(신규취득)·퇴직(자격상실)·가입(재직규모)으로 인력 이동 측정.
    # 가입자수만 보면 성장처럼 보이나 대량 입·퇴사일 수 있음(695: 순증 +42인데 회전율 2.29).
    # ⚠️ METRIC_HINTS를 거치지 않고 find_year_cols 직접 호출 — 국민연금은 재무 점수축이 아니라
    #    validate_scores 게이트(METRIC_HINTS 전멸 검사)의 fatal 대상이 되면 안 됨. 점수 미반영·맥락.
    sub_map = find_year_cols(df, "국민연금가입자수")
    emp_map = find_year_cols(df, "국민연금취업자수")
    ret_map = find_year_cols(df, "국민연금퇴직자수")
    common_e = sorted(set(sub_map) & set(emp_map) & set(ret_map))
    if common_e:
        sub_w = pd.DataFrame({y: _year_series(df, sub_map, y) for y in common_e}, index=df.index)
        emp_w = pd.DataFrame({y: _year_series(df, emp_map, y) for y in common_e}, index=df.index)
        ret_w = pd.DataFrame({y: _year_series(df, ret_map, y) for y in common_e}, index=df.index)
        obs = (sub_w.notna() & emp_w.notna() & ret_w.notna() & (sub_w > 0))
        out["고용관측연수"] = obs.sum(axis=1).astype(int)
        # 최근 관측연도(가입자>0 & 셋 다 존재)의 값으로 비율 산출.
        last_obs = obs.where(obs).apply(lambda r: r.last_valid_index(), axis=1)

        def _at_last(mat: pd.DataFrame) -> pd.Series:
            return pd.Series(
                [mat.at[i, y] if pd.notna(y) else np.nan for i, y in last_obs.items()],
                index=df.index,
            )
        sub_l, emp_l, ret_l = _at_last(sub_w), _at_last(emp_w), _at_last(ret_w)
        out["이직률_최근"] = safe_ratio(ret_l, sub_l)          # 퇴직/가입 = 유출 강도
        out["고용회전율_최근"] = safe_ratio(emp_l + ret_l, sub_l)  # (취업+퇴직)/가입 = 총 이동
        out["고용순증_최근"] = emp_l - ret_l                   # 취업−퇴직 = 절대 증감
    else:
        out["고용관측연수"] = 0
        out["이직률_최근"] = out["고용회전율_최근"] = out["고용순증_최근"] = np.nan

    # 수익성추세: 영업이익률을 연도별 횡단면 winsorize 후 기업별 기울기.
    # 원본 영업이익률 컬럼이 없으면(본선 변형) 영업이익/매출×100으로 대체 계산(%-스케일 유지).
    opm = wide("영업이익률")
    if opm.shape[1] < 2:
        yrs_f = sorted(set(ymap["영업이익손실"]) & set(ymap["매출액"]))
        if len(yrs_f) >= 2:
            print("  ⚠️ 영업이익률 원본 부족 → 영업이익/매출로 대체 계산(수익성추세)")
            opm = pd.DataFrame(
                {y: safe_ratio(sat("영업이익손실", y), sat("매출액", y)) * 100 for y in yrs_f},
                index=df.index,
            )
    if opm.shape[1] >= 2:
        opm_w = opm.apply(lambda col: winsorize(col), axis=0)  # 각 연도 컬럼 = 기업들 사이
        _opm_years = list(opm_w.columns)  # 실제 연도 x축 — 연도 컬럼이 띄엄띄엄이어도 간격 유지
        out["수익성추세"] = opm_w.apply(lambda row: slope(row.to_numpy(), x=_opm_years), axis=1)
    else:
        out["수익성추세"] = np.nan

    # ROA/ROE 추세: 연도별 값 → 기업별 기울기 (수익효율 개선/악화)
    def ratio_trend(num_metric: str, den_metric: str):
        yrs = sorted(set(ymap[num_metric]) & set(ymap[den_metric]))
        if len(yrs) < 2:
            return np.nan
        mat = pd.DataFrame(
            {y: safe_ratio(sat(num_metric, y), sat(den_metric, y)) for y in yrs},
            index=df.index,
        )
        return mat.apply(lambda row: slope(row.to_numpy(), x=yrs), axis=1)  # 실제 연도 x축

    out["ROA추세"] = ratio_trend("당기순이익손실", "자산총계")
    out["ROE추세"] = ratio_trend("당기순이익손실", "자본총계")

    # =========================== 축3 안정성 ===========================
    Lc = years_of("자본총계")[-1] if years_of("자본총계") else None
    if Lc is not None:
        eq_last = sat("자본총계", Lc)
        out["부채비율_최근"] = safe_ratio(sat("부채총계", Lc), eq_last)
        out["자기자본비율"] = safe_ratio(eq_last, sat("자산총계", Lc))  # 자본/자산, 0~1 (부채비율의 직관 버전)
        # 자본잠식 플래그: ≤0 → 1, >0 → 0, 결측 → NaN
        out["자본잠식_플래그"] = pd.Series(
            np.where(eq_last <= 0, 1.0, np.where(eq_last > 0, 0.0, np.nan)),
            index=df.index,
        )
        out["자본잠식정도"] = safe_ratio(eq_last, sat("납입자본금", Lc))  # <1 이면 잠식 진행
        out["이익잉여금축적"] = eq_last - sat("납입자본금", Lc)
    else:
        out["부채비율_최근"] = out["자기자본비율"] = out["자본잠식_플래그"] = np.nan
        out["자본잠식정도"] = out["이익잉여금축적"] = np.nan

    # 부채비율 추세: 연도별 부채/자본 → 기울기 (자본잠식 연도는 NaN→제외)
    dy = sorted(set(ymap["부채총계"]) & set(ymap["자본총계"]))
    if len(dy) >= 2:
        dr = pd.DataFrame(
            {y: safe_ratio(sat("부채총계", y), sat("자본총계", y)) for y in dy},
            index=df.index,
        )
        out["부채비율추세"] = dr.apply(lambda row: slope(row.to_numpy(), x=dy), axis=1)  # 실제 연도 x축
    else:
        out["부채비율추세"] = np.nan

    return out.reset_index(drop=True)


# --- I/O 어댑터 (parquet / Postgres) ----------------------------------------
def _engine():
    from sqlalchemy import create_engine
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL 미설정 — .env 확인 (docker-compose와 동일 값)")
    return create_engine(url)


def load_master(source: str) -> pd.DataFrame:
    if source == "parquet":
        if not MASTER_PARQUET.exists():
            raise SystemExit(f"입력 없음: {MASTER_PARQUET}\n  → 개발용 master_table.parquet을 data/에 배치하세요.")
        return pd.read_parquet(MASTER_PARQUET)
    if source == "db":
        return pd.read_sql_table(MASTER_TABLE, _engine())
    raise ValueError(f"알 수 없는 source: {source}")


def save_features(df: pd.DataFrame, source: str) -> str:
    if source == "parquet":
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        df.to_parquet(FEATURES_PARQUET, index=False)
        return str(FEATURES_PARQUET)
    if source == "db":
        df.to_sql(FEATURES_TABLE, _engine(), if_exists="replace", index=False)
        return f"DB table: {FEATURES_TABLE}"
    raise ValueError(f"알 수 없는 source: {source}")


# --- Part 3 확인 ------------------------------------------------------------
def report(master: pd.DataFrame, feat: pd.DataFrame) -> None:
    print("\n" + "=" * 60)
    print("Part 3. 확인")
    print("=" * 60)
    print(f"shape: {feat.shape}  (기업 {feat.shape[0]} × 컬럼 {feat.shape[1]})")

    print("\n[결측 개수]")
    print(feat.drop(columns=[KEY]).isna().sum().to_string())

    print("\n[describe]")
    with pd.option_context("display.max_columns", None, "display.width", 200):
        print(feat.drop(columns=[KEY]).describe().round(3).T.to_string())

    # 방어 검증: 영업이익 음수 기업 샘플
    m = norm_cols(master)
    op_last_col = find_year_cols(m, "영업이익손실")
    if op_last_col:
        last_y = max(op_last_col)
        neg_ids = m.loc[pd.to_numeric(m[op_last_col[last_y]], errors="coerce") < 0, KEY]
        print(f"\n[방어 샘플] {last_y}년 영업이익 음수 기업 {len(neg_ids)}곳 "
              f"(이익류 CAGR 금지·음수 이익률 확인)")
        cols = [KEY, "영업이익률_최근", "순이익률_최근", "흑자지속성", "수익성추세"]
        print(feat[feat[KEY].isin(neg_ids)][cols].to_string(index=False))

    # 자본잠식 방어 요약
    if "자본잠식_플래그" in feat:
        n_imp = int((feat["자본잠식_플래그"] == 1).sum())
        n_nan_dr = int(feat["부채비율_최근"].isna().sum())
        print(f"\n[자본잠식 방어] 플래그=1 기업: {n_imp}곳 / 부채비율_최근 NaN: {n_nan_dr}곳")
        print("  (자본총계≤0 → safe_ratio가 부채비율을 NaN 처리. 샘플엔 잠식 없음 →")
        print("   finance_utils 자체 테스트의 safe_ratio(10,-2)=NaN로 로직 시연됨)")


# --- main -------------------------------------------------------------------
def main() -> None:
    ap = argparse.ArgumentParser(description="재무 3축 파생컬럼 산출")
    ap.add_argument("--source", choices=["parquet", "db"], default="parquet",
                    help="입력/출력 소스 (기본 parquet; 본선 당일 db)")
    args = ap.parse_args()

    print(f"[source={args.source}] master_table 로드 중...")
    master = load_master(args.source)
    print(f"  로드 완료: shape={master.shape}\n")

    feat = compute_features(master)
    dst = save_features(feat, args.source)
    print(f"\n✅ 저장 완료 → {dst}")

    report(master, feat)


if __name__ == "__main__":
    main()

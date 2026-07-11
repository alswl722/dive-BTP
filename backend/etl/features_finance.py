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
    """hint를 포함하는 연도별 컬럼을 {연도: 컬럼명}으로 반환.

    '매출액_2020'처럼 지표명_연도 형태를 잡는다. 실제 매핑된 연도만 담기므로
    연도 범위가 달라도(본선) 그대로 동작.
    """
    out = {}
    for c in df.columns:
        if hint in str(c):
            m = re.search(r"(20\d{2})", str(c))
            if m:
                out[int(m.group(1))] = c
    return dict(sorted(out.items()))


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

    # 지표별 연도 컬럼 매핑 + 로그
    ymap = {name: find_year_cols(df, hint) for name, hint in METRIC_HINTS.items()}
    if verbose:
        print("[컬럼 매핑] (부분일치)")
        for name, yc in ymap.items():
            status = ", ".join(f"{y}:{c}" for y, c in yc.items()) or "⚠️ 매칭 없음"
            print(f"  {name:12s} → {status}")

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
        # 전년대비 성장률(YoY): 시작값 0 방어 → safe_ratio
        yoy = pd.DataFrame(
            {ys[i]: safe_ratio(sat(metric, ys[i]), sat(metric, ys[i - 1])) - 1
             for i in range(1, len(ys))},
            index=df.index,
        )
        cagr = safe_cagr(sat(metric, ys[0]), sat(metric, ys[-1]), ys[-1] - ys[0])
        stab = yoy.std(axis=1, skipna=True)  # 낮을수록 안정. 유효 전이 1개면 NaN.
        # 가속도: 최근 구간(마지막 전이) − 이전 구간(앞 2개 전이 평균)
        #   지시서 라벨 그대로: recent=23→24, prior=mean(20→21, 21→22)
        accel = yoy.iloc[:, -1] - yoy.iloc[:, :2].mean(axis=1, skipna=True)
        return cagr, stab, accel

    out["매출_CAGR"], out["매출_성장안정성"], out["매출_성장가속도"] = growth_block("매출액")
    out["자산_CAGR"], out["자산_성장안정성"], out["자산_성장가속도"] = growth_block("자산총계")

    # =========================== 축2 수익성 ===========================
    L = years_of("매출액")[-1] if years_of("매출액") else None  # 최근 연도
    if L is not None:
        out["영업이익률_최근"] = safe_ratio(sat("영업이익손실", L), sat("매출액", L))
        out["순이익률_최근"] = safe_ratio(sat("당기순이익손실", L), sat("매출액", L))
        out["매출총이익률_최근"] = safe_ratio(sat("매출액", L) - sat("매출원가", L), sat("매출액", L))
        # 자본 대비 수익 (매출 기준 마진이 못 잡는 관점): 자산·자기자본이 얼마나 벌어들이나
        out["ROA"] = safe_ratio(sat("당기순이익손실", L), sat("자산총계", L))   # 총자산이익률
        out["ROE"] = safe_ratio(sat("당기순이익손실", L), sat("자본총계", L))   # 자기자본이익률(자본≤0→NaN)
        # 본업(영업) vs 최종(순이익) 갭 = 영업외손익 비중. 음수 크면 영업외에서 이익을 까먹음.
        out["영업외손익비중"] = out["순이익률_최근"] - out["영업이익률_최근"]
        # 판관비율: 판관비 = 매출총이익 − 영업이익 = (매출−매출원가) − 영업이익
        _sga = (sat("매출액", L) - sat("매출원가", L)) - sat("영업이익손실", L)
        out["판관비율"] = safe_ratio(_sga, sat("매출액", L))
        # 효율성: 자산을 얼마나 매출로 돌리나 (성장·수익과 독립 축)
        out["총자산회전율"] = safe_ratio(sat("매출액", L), sat("자산총계", L))
    else:
        for _c in ["영업이익률_최근", "순이익률_최근", "매출총이익률_최근",
                   "ROA", "ROE", "영업외손익비중", "판관비율", "총자산회전율"]:
            out[_c] = np.nan

    # 흑자지속성: 영업이익 > 0 인 연수 (NaN은 미카운트 → False)
    op_mat = wide("영업이익손실")
    out["흑자지속성"] = (op_mat > 0).sum(axis=1).astype(int) if not op_mat.empty else 0

    # 수익성추세: 영업이익률을 연도별 횡단면 winsorize 후 기업별 기울기
    opm = wide("영업이익률")
    if opm.shape[1] >= 2:
        opm_w = opm.apply(lambda col: winsorize(col), axis=0)  # 각 연도 컬럼 = 기업들 사이
        out["수익성추세"] = opm_w.apply(lambda row: slope(row.to_numpy()), axis=1)
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
        return mat.apply(lambda row: slope(row.to_numpy()), axis=1)

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
        out["부채비율추세"] = dr.apply(lambda row: slope(row.to_numpy()), axis=1)
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

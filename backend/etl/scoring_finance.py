"""재무 축 스코어링/정규화.

features_finance(파생컬럼 24개)를 입력받아 각 지표를 **업종내 백분위(0~100)**로
정규화하고, 재무 4축 점수(성장성·수익성·효율성·안정성)를 산출한다.

설계 결정 (docs/재무축_설계노트.md 참고):
- 정규화 = 업종(KSIC 중분류) 내 백분위 + fallback(그룹 < MIN_GROUP이면 전체 대비).
  등수 기반이라 극단값에 강건하고, "동종업계 상위 X%"로 담당자에게 직관적.
- 방향 자동 보정: '낮을수록 좋음'(부채비율·성장안정성 등)은 100-백분위로 뒤집어
  항상 '높은 점수 = 좋음'.
- 점수 = 축별 4개만(종합점수 없음). 3축 겹쳐읽기(축 어긋남 판별)를 보존.
- 특수컬럼은 점수에서 제외하고 원값 passthrough:
  · 영업외손익비중 = 비단조(음수 손실 나쁨/큰 양수 일회성) → 맥락 컬럼
  · 자본잠식_플래그 = 정의상 리스크 → 대시보드 배지용 passthrough
- 절대 임계값 하드코딩 없음(점수는 상대 등수만).

구조는 features_finance와 동일: compute_scores(순수) + parquet/DB 러너.
"""

from __future__ import annotations

import argparse

import numpy as np
import pandas as pd

from features_finance import (
    KEY, DATA_DIR, MASTER_PARQUET, FEATURES_PARQUET,
    MASTER_TABLE, FEATURES_TABLE, norm_cols, _engine,
)

# --- config -----------------------------------------------------------------
SCORES_PARQUET = DATA_DIR / "features_score.parquet"
SCORES_TABLE = "features_score"

KSIC_HINT = "KSIC"      # 업종 그룹 컬럼 부분일치
KSIC_PREFIX = 3         # 그룹 단위: 앞 3자(알파벳+2자리 = 중분류, 예 'C29')
MIN_GROUP = 5           # 업종내 백분위 최소 그룹 크기. 미만이면 전체 fallback.

AXES = ["성장성", "수익성", "효율성", "안정성"]

# 파생컬럼 → (축, 방향). 방향 up=높을수록 좋음 / down=낮을수록 좋음.
SCORE_COLS = {
    # 성장성
    "매출_CAGR": ("성장성", "up"),
    "매출_성장안정성": ("성장성", "down"),
    "매출_성장가속도": ("성장성", "up"),
    "자산_CAGR": ("성장성", "up"),
    "자산_성장안정성": ("성장성", "down"),
    "자산_성장가속도": ("성장성", "up"),
    # 수익성
    "영업이익률_최근": ("수익성", "up"),
    "순이익률_최근": ("수익성", "up"),
    "매출총이익률_최근": ("수익성", "up"),
    "ROA": ("수익성", "up"),
    "ROE": ("수익성", "up"),
    "판관비율": ("수익성", "down"),
    "흑자지속성": ("수익성", "up"),
    "수익성추세": ("수익성", "up"),
    "ROA추세": ("수익성", "up"),
    "ROE추세": ("수익성", "up"),
    # 효율성
    "총자산회전율": ("효율성", "up"),
    # 안정성
    "부채비율_최근": ("안정성", "down"),
    "자기자본비율": ("안정성", "up"),
    "자본잠식정도": ("안정성", "up"),
    "이익잉여금축적": ("안정성", "up"),
    "부채비율추세": ("안정성", "down"),
}
# 점수 제외, 원값 유지 (맥락·리스크)
PASSTHROUGH = ["영업외손익비중", "자본잠식_플래그"]


# --- 순수 계산 --------------------------------------------------------------
def compute_scores(feat: pd.DataFrame, ksic: pd.Series) -> pd.DataFrame:
    """파생값 DataFrame + 업종 Series → 컬럼별 백분위 + 축별 점수 DataFrame.

    feat와 ksic는 같은 순서(행)로 정렬되어 있어야 한다.
    """
    feat = norm_cols(feat).reset_index(drop=True)
    ksic = pd.Series(np.asarray(ksic), index=feat.index)

    # 업종 그룹키(중분류) + 그룹 크기
    group = ksic.astype(str).str.strip().str.upper().str[:KSIC_PREFIX]
    group = group.replace({"": "__NA__", "NONE": "__NA__", "NAN": "__NA__"})
    gsize = group.map(group.value_counts())
    big = gsize >= MIN_GROUP  # 업종내 백분위 가능 여부

    out = pd.DataFrame({KEY: feat[KEY].values})
    axis_members: dict[str, list] = {a: [] for a in AXES}

    for col, (axis, direction) in SCORE_COLS.items():
        if col not in feat.columns:
            print(f"  ⚠️ '{col}' 파생컬럼 없음 — 건너뜀")
            continue
        v = pd.to_numeric(feat[col], errors="coerce")
        # 업종내 백분위 vs 전체 백분위 (원값 NaN은 백분위도 NaN 유지)
        within = v.groupby(group).rank(pct=True) * 100
        whole = v.rank(pct=True) * 100
        pct = within.where(big, whole)
        if direction == "down":
            pct = 100 - pct
        out[f"pct_{col}"] = pct.values
        axis_members[axis].append(f"pct_{col}")

    # 축 점수 = 소속 컬럼 백분위 평균(NaN 제외). 전부 NaN이면 NaN.
    for axis in AXES:
        cols = axis_members[axis]
        out[f"{axis}점수"] = out[cols].mean(axis=1, skipna=True) if cols else np.nan

    # 특수컬럼 passthrough (점수 미반영)
    for col in PASSTHROUGH:
        if col in feat.columns:
            out[col] = feat[col].values

    # 업종/기준 메타
    out["업종그룹"] = group.values
    out["백분위기준"] = np.where(big, "업종내", "전체fallback")

    # 컬럼 순서: KEY → 축점수 → pct_* → passthrough → 메타
    score_cols = [f"{a}점수" for a in AXES]
    pct_cols = [c for c in out.columns if c.startswith("pct_")]
    meta = [c for c in PASSTHROUGH if c in out.columns] + ["업종그룹", "백분위기준"]
    return out[[KEY] + score_cols + pct_cols + meta]


# --- I/O 어댑터 -------------------------------------------------------------
def load_inputs(source: str):
    """(features_df, master_df) 반환. master는 KSIC 그룹용."""
    if source == "parquet":
        if not FEATURES_PARQUET.exists():
            raise SystemExit(f"입력 없음: {FEATURES_PARQUET}\n  → 먼저 features_finance.py를 실행하세요.")
        return pd.read_parquet(FEATURES_PARQUET), pd.read_parquet(MASTER_PARQUET)
    if source == "db":
        eng = _engine()
        return pd.read_sql_table(FEATURES_TABLE, eng), pd.read_sql_table(MASTER_TABLE, eng)
    raise ValueError(f"알 수 없는 source: {source}")


def save_scores(df: pd.DataFrame, source: str) -> str:
    if source == "parquet":
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        df.to_parquet(SCORES_PARQUET, index=False)
        return str(SCORES_PARQUET)
    if source == "db":
        df.to_sql(SCORES_TABLE, _engine(), if_exists="replace", index=False)
        return f"DB table: {SCORES_TABLE}"
    raise ValueError(f"알 수 없는 source: {source}")


def _align_ksic(feat: pd.DataFrame, master: pd.DataFrame) -> pd.Series:
    """feat 행 순서에 맞춘 KSIC Series 반환 (기업일련번호 조인)."""
    m = norm_cols(master)
    ksic_col = next((c for c in m.columns if KSIC_HINT in str(c)), None)
    if ksic_col is None:
        print("  ⚠️ KSIC 컬럼 없음 — 전체 fallback으로만 동작")
        return pd.Series(np.nan, index=range(len(feat)))
    merged = norm_cols(feat)[[KEY]].merge(
        m[[KEY, ksic_col]].drop_duplicates(KEY), on=KEY, how="left")
    return merged[ksic_col]


# --- 확인 -------------------------------------------------------------------
def report(scores: pd.DataFrame) -> None:
    print("\n" + "=" * 60)
    print("확인")
    print("=" * 60)
    print(f"shape: {scores.shape}")

    score_cols = [f"{a}점수" for a in AXES]
    print("\n[축 점수 describe] (0~100)")
    with pd.option_context("display.width", 200):
        print(scores[score_cols].describe().round(1).T.to_string())

    print("\n[백분위 기준 분포]")
    print(scores["백분위기준"].value_counts().to_string())

    print("\n[기업별 4축 점수]")
    view = scores[[KEY] + score_cols + ["자본잠식_플래그"]].copy()
    print(view.round(1).to_string(index=False))

    # 정합성 스팟체크 — 종합평균이 아니라 '방향별 사실'을 검증
    # (평균으로 줄세우면 축 어긋남이 사라짐 → 우리 설계가 축별 점수를 유지하는 이유)
    def _rank_of(company, col, ascending):
        s = scores.set_index(KEY)[col]
        order = s.sort_values(ascending=ascending).index.tolist()
        return order.index(company) + 1 if company in order else None
    print("\n[스팟체크] 방향 정합성 (등수는 낮을수록 해당 방향 극단)")
    checks = [
        ("2080 안정성 최하위(부채 26.5배)", _rank_of(2080, "안정성점수", True), 1),
        ("1730 효율성 최상위(회전율 2.2)", _rank_of(1730, "효율성점수", False), 1),
        ("1878 효율성 최하위(회전율 0.12)", _rank_of(1878, "효율성점수", True), 1),
        ("2379 수익성 최하위(만성적자)", _rank_of(2379, "수익성점수", True), 1),
        ("1049 안정성 최상위(전축 우량)", _rank_of(1049, "안정성점수", False), 1),
    ]
    for name, rank, expect in checks:
        ok = "✅" if rank == expect else f"⚠️(실제 {rank}위)"
        print(f"  {name}: {ok}")


def main() -> None:
    ap = argparse.ArgumentParser(description="재무 축 스코어링/정규화")
    ap.add_argument("--source", choices=["parquet", "db"], default="parquet")
    args = ap.parse_args()

    print(f"[source={args.source}] features_finance + master 로드 중...")
    feat, master = load_inputs(args.source)
    print(f"  features shape={feat.shape}, master shape={master.shape}\n")

    ksic = _align_ksic(feat, master)
    scores = compute_scores(feat, ksic)
    dst = save_scores(scores, args.source)
    print(f"✅ 저장 완료 → {dst}")

    report(scores)


if __name__ == "__main__":
    main()

"""재무 축 스코어링/정규화.

features_finance(파생컬럼 24개)를 입력받아 각 지표를 **업종내 백분위(0~100)**로
정규화하고, 재무 4축 점수(성장성·수익성·효율성·안정성)를 산출한다.

설계 결정 (docs/재무축_설계노트.md 참고):
- 정규화 = 업종(KSIC 중분류) 내 백분위 + fallback(그룹 < MIN_GROUP이면 전체 대비).
  등수 기반이라 극단값에 강건하고, "동종업계 상위 X%"로 담당자에게 직관적.
- (선택) 기업규모(대/중/소) 3단 계층 fallback: KSIC×규모 → KSIC단독 → 전체.
  대기업·소기업을 같은 업종그룹에서 그냥 비교하면 규모 자체가 만드는 절대 격차가
  성장/수익 백분위를 왜곡할 수 있어, 규모까지 같은 동종군이 충분히 크면(MIN_GROUP
  이상) 그걸 우선 쓰고, 표본이 작으면 자동으로 상위 tier(KSIC단독→전체)로 강등한다.
  size 인자를 안 넘기면 기존 2단 동작과 완전히 동일(하위호환).
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
KSIC_PATTERN = r"^[A-Z]\d{2}"  # 정상 그룹키 포맷(11차 중분류). 아니면 fallback.
SIZE_HINT = "기업규모"   # 기업규모(대/중/소) 컬럼 부분일치. size 인자 미제공 시 미사용.
# 통계 신뢰 가드 (데이터 판단 임계값이 아니라 등수 산출의 최소 표본 조건)
MIN_VALID = 3           # 컬럼 유효값이 이보다 적으면 백분위 산출 안 함(단독 100점 방지)
MIN_AXIS_RATIO = 0.5    # 축 점수에 필요한 최소 유효 컬럼 비율(결측이 점수를 왜곡하는 것 방지)

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
# 점수 제외, 원값 유지 (맥락·리스크·데이터품질)
PASSTHROUGH = ["영업외손익비중", "자본잠식_플래그", "흑자관측연수", "데이터모순_판관비음수",
               "영업외의존_연수", "재무관측연수",
               # 고용축 (점수축과 별도) — 규모·처우·생산성·회전율 모두 passthrough
               "이직률_최근", "고용회전율_최근", "고용순증_최근", "고용관측연수",
               "종업원수_최근", "종업원수_CAGR", "종업원수_증감_5년",
               "1인평균급여_최근", "1인평균급여_CAGR",
               "인당매출_최근", "인당영업이익_최근"]

# 맥락 지표 → 업종내 백분위(점수 미반영, 배지 포지션 바용). {파생컬럼: 출력백분위컬럼}
# 고용축 백분위는 프론트 "업종 대비" 표시용. 실측 스코어링과 분리.
CONTEXT_PCT_COLS = {
    "고용회전율_최근": "고용회전율_백분위",
    "1인평균급여_최근": "급여_백분위",
    "종업원수_CAGR": "종업원수증가_백분위",
    "인당매출_최근": "인당매출_백분위",
}


# --- 순수 계산 --------------------------------------------------------------
def compute_scores(feat: pd.DataFrame, ksic: pd.Series, size: pd.Series | None = None) -> pd.DataFrame:
    """파생값 DataFrame + 업종 Series (+ 선택: 기업규모 Series) → 컬럼별 백분위 + 축별 점수 DataFrame.

    feat·ksic·size는 같은 순서(행)로 정렬되어 있어야 한다.
    size를 넘기지 않으면(기본값 None) 기존 2단(업종내/전체fallback) 동작과 완전히 동일.
    """
    feat = norm_cols(feat).reset_index(drop=True)
    ksic = pd.Series(np.asarray(ksic), index=feat.index)

    # 업종 그룹키(중분류): 결측은 명시적으로 __NA__ 처리.
    # ※ pandas 3부터 astype(str)이 NaN을 문자열 'nan'으로 바꾸지 않고 NaN으로
    #   유지하므로, 문자열 치환이 아니라 isna() 마스크로 처리해야 한다.
    group = ksic.astype(str).str.strip().str.upper().str[:KSIC_PREFIX]
    group = group.where(ksic.notna() & (group != ""), "__NA__")
    # 포맷 검증: 11차 중분류 패턴(알파벳+2자리)이 아니면(숫자형 42500 등) 그룹
    # 스킴이 섞여 조각나므로 __NA__로 강등 → 무조건 전체 fallback.
    bad_fmt = (group != "__NA__") & ~group.str.match(KSIC_PATTERN, na=False)
    if bad_fmt.any():
        print(f"  ⚠️ KSIC 포맷 비정상 {int(bad_fmt.sum())}건(예: {group[bad_fmt].iloc[0]}) → 전체 fallback 처리")
        group = group.where(~bad_fmt, "__NA__")
    gsize = group.map(group.value_counts())
    big = (gsize >= MIN_GROUP) & (group != "__NA__")  # __NA__는 크기 무관 전체 fallback

    # 기업규모 3단 tier: KSIC×규모 그룹이 MIN_GROUP 이상이면 그걸 최우선 사용.
    # 대/중/소기업을 같은 업종그룹에서 뭉쳐 비교하면 규모 자체의 절대격차가 백분위를
    # 왜곡할 수 있어, 표본이 충분할 때만 더 세분화된 동종군으로 비교한다.
    size_group = None
    size_big = None
    if size is not None:
        size = pd.Series(np.asarray(size), index=feat.index)
        size_norm = size.astype(str).str.strip()
        size_norm = size_norm.where(size.notna() & (size_norm != "") & (size_norm.str.lower() != "nan"), "__NA__")
        size_group = group + "|" + size_norm
        size_group = size_group.where((group != "__NA__") & (size_norm != "__NA__"), "__NA__")
        sgsize = size_group.map(size_group.value_counts())
        size_big = (sgsize >= MIN_GROUP) & (size_group != "__NA__")

    out = pd.DataFrame({KEY: feat[KEY].values})
    axis_members: dict[str, list] = {a: [] for a in AXES}

    for col, (axis, direction) in SCORE_COLS.items():
        if col not in feat.columns:
            print(f"  ⚠️ '{col}' 파생컬럼 없음 — 건너뜀")
            continue
        v = pd.to_numeric(feat[col], errors="coerce")
        # 희소 컬럼 가드: 유효값이 MIN_VALID 미만이면 등수 자체가 무의미
        # (유효 1개면 그 기업이 근거 없이 백분위 100) → 컬럼 전체 NaN.
        if int(v.notna().sum()) < MIN_VALID:
            print(f"  ⚠️ '{col}' 유효값 {int(v.notna().sum())}개 < {MIN_VALID} → 백분위 제외")
            out[f"pct_{col}"] = np.nan
            axis_members[axis].append(f"pct_{col}")
            continue
        # 업종내 백분위 vs 전체 백분위 (원값 NaN은 백분위도 NaN 유지)
        within = v.groupby(group).rank(pct=True) * 100
        whole = v.rank(pct=True) * 100
        pct = within.where(big, whole)
        if size_group is not None:
            # 3단 tier 최우선: KSIC×규모 그룹이 충분히 크면 그 등수로 덮어씀
            within_size = v.groupby(size_group).rank(pct=True) * 100
            pct = within_size.where(size_big, pct)
        if direction == "down":
            pct = 100 - pct
        out[f"pct_{col}"] = pct.values
        axis_members[axis].append(f"pct_{col}")

    # 축 점수 = 소속 컬럼 백분위 평균(NaN 제외).
    # 유효 컬럼이 절반 미만이면 NaN — 결측 제외 평균은 점수를 올릴 수도 있어(실증:
    # CAGR만 NaN인 기업의 성장성 52→69) 부분 데이터 점수를 정상 점수처럼 내보내지 않는다.
    # 유효컬럼수_*를 함께 출력해 프론트가 "정보부족" 배지를 달 수 있게 한다.
    for axis in AXES:
        cols = axis_members[axis]
        if cols:
            valid_n = out[cols].notna().sum(axis=1)
            need = max(1, int(np.ceil(len(cols) * MIN_AXIS_RATIO)))
            out[f"{axis}점수"] = out[cols].mean(axis=1, skipna=True).where(valid_n >= need)
            out[f"유효컬럼수_{axis}"] = valid_n.astype(int)
        else:
            out[f"{axis}점수"] = np.nan
            out[f"유효컬럼수_{axis}"] = 0

    # 특수컬럼 passthrough (점수 미반영)
    for col in PASSTHROUGH:
        if col in feat.columns:
            out[col] = feat[col].values

    # 맥락 지표 백분위 (점수 미반영·축 미소속, 배지 포지션 바용).
    # 방향 무보정(높을수록 불안정 그대로) — 프론트가 위치만 그리고 색은 임계로 판단.
    # 'pct_' 접두를 피해 percentiles dict(company_view) 자동수집에 안 끼게 한다.
    #
    # ⚠️ SCORE_COLS와 동일한 3단 tier 적용: KSIC×규모 → 업종내 → 전체 fallback.
    # 종업원수·급여·인당지표는 대/중/소기업 편차가 크므로 같은 KSIC 안에서도 규모별로 비교해야
    # 소상공인 vs 중견기업 뒤섞임으로 인한 왜곡을 피한다. 표본이 작아 tier가 fallback되는 상황도
    # 있으나, 본선 대량 데이터에서 유의미해지도록 상위 tier 우선 로직을 미리 심는다.
    for src, dst in CONTEXT_PCT_COLS.items():
        if src in feat.columns:
            cv = pd.to_numeric(feat[src], errors="coerce")
            if int(cv.notna().sum()) >= MIN_VALID:
                within = cv.groupby(group).rank(pct=True) * 100
                whole = cv.rank(pct=True) * 100
                pct_ctx = within.where(big, whole)
                if size_group is not None:
                    # 3단 tier 최우선: KSIC×규모 그룹이 충분히 크면 그 등수로 덮어씀
                    within_size = cv.groupby(size_group).rank(pct=True) * 100
                    pct_ctx = within_size.where(size_big, pct_ctx)
                out[dst] = pct_ctx.values
            else:
                out[dst] = np.nan
        else:
            out[dst] = np.nan

    # 업종/기준 메타
    out["업종그룹"] = group.values
    basis = np.where(big, "업종내", "전체fallback")
    if size_big is not None:
        basis = np.where(np.asarray(size_big), "업종x규모", basis)
    out["백분위기준"] = basis

    # 컬럼 순서: KEY → 축점수 → 유효컬럼수 → pct_* → passthrough → 맥락백분위 → 메타
    score_cols = [f"{a}점수" for a in AXES]
    valid_cols = [f"유효컬럼수_{a}" for a in AXES]
    pct_cols = [c for c in out.columns if c.startswith("pct_")]
    ctx_cols = [d for d in CONTEXT_PCT_COLS.values() if d in out.columns]
    meta = [c for c in PASSTHROUGH if c in out.columns] + ["업종그룹", "백분위기준"]
    return out[[KEY] + score_cols + valid_cols + pct_cols + ctx_cols + meta]


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


def _align_size(feat: pd.DataFrame, master: pd.DataFrame) -> pd.Series | None:
    """feat 행 순서에 맞춘 기업규모(대/중/소) Series 반환. 컬럼 없으면 None(기존 2단 동작)."""
    m = norm_cols(master)
    size_col = next((c for c in m.columns if SIZE_HINT in str(c)), None)
    if size_col is None:
        print("  ℹ️ 기업규모 컬럼 없음 — KSIC×규모 tier 생략(기존 2단 동작)")
        return None
    merged = norm_cols(feat)[[KEY]].merge(
        m[[KEY, size_col]].drop_duplicates(KEY), on=KEY, how="left")
    return merged[size_col]


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
    size = _align_size(feat, master)
    scores = compute_scores(feat, ksic, size)
    dst = save_scores(scores, args.source)
    print(f"✅ 저장 완료 → {dst}")

    report(scores)


if __name__ == "__main__":
    main()

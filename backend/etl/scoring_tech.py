"""기술력 축 스코어링/정규화 (축4 R&D·특허 / 축6 NTIS).

features_tech의 파생컬럼을 업종내 백분위(0~100)로 정규화하고 축 점수를 산출한다.
설계는 scoring_finance.py와 동일 철학:
- 업종(KSIC 중분류) 내 백분위 + fallback(그룹 < MIN_GROUP이면 전체 대비).
- 방향 보정: '낮을수록 좋음'은 100-백분위로 뒤집어 항상 '높은 점수 = 좋음'.
- 절대 임계값 하드코딩 없음(등수 기반).

축 = R&D·특허 / NTIS 두 개. **인증은 점수화하지 않는다**(샘플 전원 보유 → 변별력 0).
대신 인증 관련은 배지/플래그로 passthrough:
- 인증_핵심보유 / 인증_보유수 / 산학협력_여부 : 배지
- 인증실체괴리_플래그 : 리스크 배지 (scoring_finance의 자본잠식_플래그와 동일 취급)
"""

from __future__ import annotations

import argparse

import numpy as np
import pandas as pd

KEY = "company_id"
KSIC_COL = "ksic_code"       # companies 테이블 업종코드
KSIC_PREFIX = 3              # 중분류(예 'C29')
MIN_GROUP = 5               # 업종내 백분위 최소 그룹. 미만이면 전체 fallback.

AXES = ["R&D특허", "NTIS"]

# 파생컬럼 → (축, 방향). up=높을수록 좋음 / down=낮을수록 좋음.
SCORE_COLS = {
    # R&D·특허
    "R&D집약도": ("R&D특허", "up"),
    "R&D집약도추세": ("R&D특허", "up"),
    "특허출원_건수": ("R&D특허", "up"),
    "특허등록_건수": ("R&D특허", "up"),
    "특허등록전환율": ("R&D특허", "up"),
    "첫특허_업력": ("R&D특허", "down"),   # 설립 후 빨리 출원할수록 좋음
    # NTIS
    "NTIS주관_과제수": ("NTIS", "up"),
    "NTIS주관_정부연구비": ("NTIS", "up"),
    "NTIS주관_부처다양성": ("NTIS", "up"),
    "NTIS위탁_과제수": ("NTIS", "up"),
}
# 점수 미반영, 원값/배지 유지
PASSTHROUGH = ["인증_보유수", "인증_핵심보유", "산학협력_여부", "인증실체괴리_플래그"]


def compute_scores(feat: pd.DataFrame, ksic: pd.Series) -> pd.DataFrame:
    """파생값 + 업종 Series → 컬럼별 백분위 + 축 점수. feat/ksic는 같은 행 순서."""
    feat = feat.reset_index(drop=True)
    ksic = pd.Series(np.asarray(ksic), index=feat.index)

    group = ksic.astype(str).str.strip().str.upper().str[:KSIC_PREFIX]
    group = group.replace({"": "__NA__", "NONE": "__NA__", "NAN": "__NA__"})
    gsize = group.map(group.value_counts())
    big = gsize >= MIN_GROUP

    out = pd.DataFrame({KEY: feat[KEY].values})
    axis_members: dict[str, list] = {a: [] for a in AXES}

    for col, (axis, direction) in SCORE_COLS.items():
        if col not in feat.columns:
            print(f"  ⚠️ '{col}' 파생컬럼 없음 — 건너뜀")
            continue
        v = pd.to_numeric(feat[col], errors="coerce")
        within = v.groupby(group).rank(pct=True) * 100
        whole = v.rank(pct=True) * 100
        pct = within.where(big, whole)
        if direction == "down":
            pct = 100 - pct
        out[f"pct_{col}"] = pct.values
        axis_members[axis].append(f"pct_{col}")

    for axis in AXES:
        cols = axis_members[axis]
        out[f"{axis}점수"] = out[cols].mean(axis=1, skipna=True) if cols else np.nan

    for col in PASSTHROUGH:
        if col in feat.columns:
            out[col] = feat[col].values

    out["업종그룹"] = group.values
    out["백분위기준"] = np.where(big, "업종내", "전체fallback")

    score_cols = [f"{a}점수" for a in AXES]
    pct_cols = [c for c in out.columns if c.startswith("pct_")]
    meta = [c for c in PASSTHROUGH if c in out.columns] + ["업종그룹", "백분위기준"]
    return out[[KEY] + score_cols + pct_cols + meta]


def _align_ksic(feat: pd.DataFrame, companies: pd.DataFrame) -> pd.Series:
    """feat 행 순서에 맞춘 KSIC Series (company_id 조인)."""
    if KSIC_COL not in companies.columns:
        print(f"  ⚠️ '{KSIC_COL}' 컬럼 없음 — 전체 fallback으로만 동작")
        return pd.Series(np.nan, index=range(len(feat)))
    merged = feat[[KEY]].merge(
        companies[[KEY, KSIC_COL]].drop_duplicates(KEY), on=KEY, how="left")
    return merged[KSIC_COL]


def report(scores: pd.DataFrame) -> None:
    score_cols = [f"{a}점수" for a in AXES]
    print(f"\n[축 점수] (0~100)\n{scores[score_cols].describe().round(1).T.to_string()}")
    print(f"\n[백분위 기준]\n{scores['백분위기준'].value_counts().to_string()}")
    print("\n[기업별 기술력 점수 + 배지]")
    view = scores[[KEY] + score_cols + ["인증_핵심보유", "인증실체괴리_플래그"]]
    with pd.option_context("display.width", 200):
        print(view.round(1).to_string(index=False))


def main() -> None:
    ap = argparse.ArgumentParser(description="기술력 축 스코어링")
    ap.add_argument("--source", choices=["dev", "db"], default="dev")
    args = ap.parse_args()

    import aggregate_tech
    import features_tech as ft
    if args.source == "dev":
        from dev_loader import load_tables
        tables = load_tables()
    else:
        raise SystemExit("db 소스는 팀원 C 스키마 확정 후 연결")

    agg = aggregate_tech.build(tables)
    feat = ft.compute_features(agg, tables["company_yearly_metrics"], tables["companies"])
    ksic = _align_ksic(feat, tables["companies"])
    scores = compute_scores(feat, ksic)
    report(scores)


if __name__ == "__main__":
    main()

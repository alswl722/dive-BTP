"""NTIS 지역구분명 분포 EDA — 결측 대체 정책 근거.

방침:
    결측치 처리 전략 문서(§NTIS 지역구분명)의 "최빈값 대체 vs '기타 기타' 대체"
    판단 근거. 기업당 지역 종류수·최빈값 점유율을 실측한다.

    ⚠️ 읽기 전용. 대체 규칙은 이 EDA 결과 검토 후 팀 합의.

두 가지를 본다:
    1. 기업당 지역구분 종류 개수 분포 (1개인 기업 vs 여러개인 기업 비율)
    2. 여러 값 가진 기업의 최빈값 점유율 (최빈값 대체 손실 정량화)

사용:
    python scripts/eda_ntis_region.py [--kodata <path.xlsx>]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
for cand in (Path("/app/etl"), ROOT / "backend" / "etl"):
    if (cand / "parsers.py").exists():
        sys.path.insert(0, str(cand))
        break

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from parsers import parse_simple_sheet  # noqa: E402
from eda_viz import PALETTE, save_fig, setup as viz_setup, write_meta  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402

DEFAULT_KODATA = ROOT / "backend" / "etl" / "data" / "배포_샘플_KODATA_기업데이터_26-07-06.xlsx"
SHEET = "3-1. NTIS(주관)"


def _head(t: str) -> None:
    print(f"\n{'─' * 72}\n{t}\n{'─' * 72}")


def main() -> None:
    ap = argparse.ArgumentParser(description="NTIS 지역구분명 분포 (읽기 전용)")
    ap.add_argument("--kodata", default=str(DEFAULT_KODATA))
    args = ap.parse_args()
    path = Path(args.kodata)
    if not path.exists():
        sys.exit(f"❌ 파일 없음: {path}")

    try:
        df = parse_simple_sheet(str(path), SHEET, 2)
    except Exception as e:  # noqa: BLE001
        print(f"⚠️ 시트 로드 실패: {e}")
        write_meta("07_ntis_region", title="NTIS 지역구분명 분포",
                   description="시트 로드 실패", images=[],
                   highlights=[f"오류: {e}"], status="info")
        return

    n = len(df)
    col_region = next((c for c in df.columns if "지역구분" in c), None)
    col_key = next((c for c in df.columns if "기업일련번호" in c), None)

    print("=" * 72)
    print(f"NTIS(주관) 지역구분명 분포 EDA — {path.name}  (과제 {n}행)")
    print("=" * 72)

    if not col_region or not col_key:
        print(f"⚠️ 필요 컬럼 없음 (지역구분={col_region}, 기업일련번호={col_key})")
        write_meta("07_ntis_region", title="NTIS 지역구분명 분포",
                   description="필요 컬럼 없음", images=[],
                   highlights=["지역구분명 컬럼 미검출"], status="info")
        return

    df = df.dropna(subset=[col_key])
    df[col_key] = df[col_key].astype(int)

    # ── 1. 기업당 지역 종류 개수 분포 ────────────────────────────
    _head("[1] 기업당 지역구분 종류 개수 분포")
    per_company = df.groupby(col_key)[col_region].agg(lambda s: s.dropna().nunique())
    n_companies = len(per_company)
    variety_counts = per_company.value_counts().sort_index()
    print(f"  NTIS 참여 기업: {n_companies}개")
    print("\n  종류 개수 분포:")
    for k, v in variety_counts.items():
        pct = 100 * v / n_companies
        marker = " ← 대부분" if pct >= 50 else ""
        print(f"    {k}종류: {v}개 기업 ({pct:.1f}%){marker}")

    # ── 2. 최빈값 점유율 (여러 값 가진 기업) ────────────────────
    _head("[2] 여러 지역 가진 기업의 최빈값 점유율")
    multi = per_company[per_company > 1].index
    if len(multi) > 0:
        multi_df = df[df[col_key].isin(multi)]
        share_data = []
        for cid, g in multi_df.groupby(col_key):
            vc = g[col_region].dropna().value_counts()
            if len(vc) > 0:
                share = vc.iloc[0] / vc.sum()
                share_data.append({"company": cid, "n_regions": len(vc), "mode_share": share,
                                   "n_total": int(vc.sum())})
        shares = pd.DataFrame(share_data)
        print(f"  여러 지역 가진 기업 {len(shares)}개 · 최빈값 점유율 요약:")
        print(f"    median={shares['mode_share'].median():.1%}, "
              f"Q25={shares['mode_share'].quantile(0.25):.1%}, "
              f"Q75={shares['mode_share'].quantile(0.75):.1%}")
        low_share = int((shares["mode_share"] < 0.5).sum())
        print(f"    최빈값 점유율 < 50% (동률에 가까움): {low_share}개")
    else:
        shares = pd.DataFrame()
        print("  여러 지역 가진 기업 없음 — 최빈값 대체가 항상 안전")

    _render_visualizations(variety_counts, shares, n_companies)


def _render_visualizations(variety_counts, shares, n_companies) -> None:
    viz_setup()
    CAT = "07_ntis_region"

    # (1) 종류 개수 분포 bar
    fig, ax = plt.subplots(figsize=(10, 5))
    if len(variety_counts) > 0:
        colors = [PALETTE["good"] if k == 1 else PALETTE["warn"] if k <= 3 else PALETTE["bad"]
                  for k in variety_counts.index]
        bars = ax.bar(variety_counts.index.astype(str), variety_counts.values, color=colors)
        for b, c in zip(bars, variety_counts.values):
            pct = 100 * c / n_companies
            ax.text(b.get_x() + b.get_width()/2, c + max(variety_counts.values)*0.02,
                    f"{c}개\n({pct:.0f}%)", ha="center", fontsize=10, fontweight="bold")
        ax.set_xlabel("지역구분 종류 개수")
        ax.set_ylabel("기업 수")
        ax.set_title(f"기업당 지역구분 종류 개수 분포 (NTIS 참여 {n_companies}개 기업)")
    save_fig(fig, CAT, "region_variety_per_company", "기업당 지역 종류수")

    # (2) 최빈값 점유율 histogram (여러 지역 가진 기업)
    if len(shares) > 0:
        fig, ax = plt.subplots(figsize=(10, 5))
        ax.hist(shares["mode_share"], bins=np.arange(0, 1.05, 0.1),
                color=PALETTE["primary"], alpha=0.7, edgecolor="white")
        ax.axvline(0.5, color=PALETTE["bad"], linestyle="--", label="50% (동률 경계)")
        ax.axvline(shares["mode_share"].median(), color=PALETTE["good"], linestyle="-",
                   label=f"median = {shares['mode_share'].median():.1%}")
        ax.set_xlabel("최빈값 점유율 (해당 기업 내)")
        ax.set_ylabel("기업 수")
        ax.legend()
        ax.set_title(f"여러 지역 가진 기업 {len(shares)}개의 최빈값 점유율 분포")
        save_fig(fig, CAT, "mode_dominance", "최빈값 점유율")

    # meta
    images = [{"file": "region_variety_per_company.png",
               "caption": f"NTIS 참여 {n_companies}개 기업의 지역 종류수"}]
    if len(shares) > 0:
        images.append({"file": "mode_dominance.png",
                       "caption": f"여러 지역 기업 {len(shares)}개의 최빈값 점유율"})

    highlights = []
    single = int(variety_counts.get(1, 0))
    if n_companies > 0:
        pct_single = 100 * single / n_companies
        if pct_single >= 80:
            highlights.append(f"단일 지역 기업 {pct_single:.0f}% — 최빈값 대체 대부분 안전")
        else:
            highlights.append(f"다중 지역 기업 {100 - pct_single:.0f}% — 최빈값 대체 시 정보 손실 고려")

    if len(shares) > 0:
        low = int((shares["mode_share"] < 0.5).sum())
        if low > 0:
            highlights.append(f"⚠️ 최빈값 점유율 <50% 기업 {low}개 — '기타 기타' 대체 검토 대상")

    status = "warn" if any("⚠️" in h for h in highlights) else "good"
    write_meta(CAT, title="NTIS 지역구분명 분포",
               description="기업당 지역 종류수·최빈값 점유율로 최빈값 대체 vs '기타 기타' 대체 판단 근거.",
               images=images, highlights=highlights, status=status)


if __name__ == "__main__":
    main()

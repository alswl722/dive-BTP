"""기업규모 경계값 실측 EDA — 규모별 종업원수·매출액 분포로 법정 임계선 검증.

방침:
    결측치 처리 전략 문서(§기업규모)의 "실제데이터로 EDA 경계값 설정" 항목 근거.
    법정 임계선(SANGONGIN_EMP_10=10, SME_REVENUE_CEILING=1,500억)이 실 분포와 얼마나
    부합하는지 실측한다. 이 스크립트는 상수를 바꾸지 않고, 근거만 제공한다.

    ⚠️ 읽기 전용. 판정 상수는 company_size_checks.py에 있고, 이 EDA는 그 값과
    실 분포를 대조하는 진단만 한다.

세 가지를 본다:
    1. 규모별 종업원수·매출액 요약통계 (min/Q25/median/Q75/max)
    2. 규모별 분포 histogram (법정 임계선 대비 위치)
    3. 종업원수 vs 매출액 산점도 (규모별 색상)

사용:
    python scripts/eda_size_thresholds.py [--kodata <path.xlsx>]
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

from parsers import parse_company_info  # noqa: E402
from company_size_checks import (  # noqa: E402
    SIZE_ORDER, SANGONGIN_EMP_10, SANGONGIN_EMP_ETC,
    SME_REVENUE_CEILING, LARGE_ASSET_CEILING, EOK, eok as _eok,
)
from eda_viz import PALETTE, save_fig, setup as viz_setup, write_meta  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402

DEFAULT_KODATA = ROOT / "backend" / "etl" / "data" / "배포_샘플_KODATA_기업데이터_26-07-06.xlsx"

SIZE_COLORS = {
    "소상공인": PALETTE["muted"],
    "소기업":   PALETTE["info"],
    "중기업":   PALETTE["primary"],
    "대기업":   PALETTE["bad"],
}


def _head(t: str) -> None:
    print(f"\n{'─' * 72}\n{t}\n{'─' * 72}")


def _latest_valid(yearly: pd.DataFrame, col: str) -> pd.Series:
    d = yearly[["기업일련번호", "year", col]].copy()
    d[col] = pd.to_numeric(d[col], errors="coerce")
    d = d.dropna(subset=[col]).sort_values(["기업일련번호", "year"])
    return d.groupby("기업일련번호")[col].last()


def _recent3_mean(yearly: pd.DataFrame, col: str) -> pd.Series:
    d = yearly[["기업일련번호", "year", col]].copy()
    d[col] = pd.to_numeric(d[col], errors="coerce")
    d = d.dropna(subset=[col]).sort_values(["기업일련번호", "year"])
    return d.groupby("기업일련번호")[col].apply(lambda s: s.tail(3).mean())


def main() -> None:
    ap = argparse.ArgumentParser(description="기업규모 경계값 실측 (읽기 전용)")
    ap.add_argument("--kodata", default=str(DEFAULT_KODATA))
    args = ap.parse_args()
    path = Path(args.kodata)
    if not path.exists():
        sys.exit(f"❌ 파일 없음: {path}")

    static_df, yearly_df = parse_company_info(str(path))
    n = len(static_df)
    print("=" * 72)
    print(f"기업규모 경계값 실측 EDA — {path.name}  (기업 {n}개)")
    print("=" * 72)

    df = pd.DataFrame({
        "size": static_df.set_index("기업일련번호")["기업규모(대/중/소)"],
        "emp": _latest_valid(yearly_df, "종업원수"),
        "rev3y": _recent3_mean(yearly_df, "매출액"),
    }).dropna(subset=["size"])

    _head("[1] 규모별 종업원수 요약통계")
    print(f"{'규모':6s} {'n':>4s} {'min':>6s} {'Q25':>6s} {'median':>8s} {'Q75':>6s} {'max':>6s}")
    for label in SIZE_ORDER:
        g = df[df["size"] == label]["emp"].dropna()
        if len(g) == 0:
            print(f"{label:6s} {'-':>4s}  (표본 없음)")
            continue
        print(f"{label:6s} {len(g):>4d} {g.min():>6.0f} {g.quantile(0.25):>6.0f} "
              f"{g.median():>8.0f} {g.quantile(0.75):>6.0f} {g.max():>6.0f}")
    print(f"\n  법정 임계선: 소상공인 상한 {SANGONGIN_EMP_10}명(제조·광업·건설·운수) / {SANGONGIN_EMP_ETC}명(기타)")

    _head("[2] 규모별 매출액(3년평균) 요약통계 (억)")
    print(f"{'규모':6s} {'n':>4s} {'min':>8s} {'Q25':>8s} {'median':>8s} {'Q75':>8s} {'max':>8s}")
    for label in SIZE_ORDER:
        g = df[df["size"] == label]["rev3y"].dropna()
        if len(g) == 0:
            continue
        print(f"{label:6s} {len(g):>4d} {g.min()/EOK:>7.0f}억 {g.quantile(0.25)/EOK:>7.0f}억 "
              f"{g.median()/EOK:>7.0f}억 {g.quantile(0.75)/EOK:>7.0f}억 {g.max()/EOK:>7.0f}억")
    print(f"\n  법정 임계선: 중소 상한 {_eok(SME_REVENUE_CEILING)} / 대기업 자산 {_eok(LARGE_ASSET_CEILING)}")

    _render_visualizations(df, n)


def _render_visualizations(df: pd.DataFrame, n: int) -> None:
    viz_setup()
    CAT = "04_size_thresholds"

    # (1) 규모별 종업원수 histogram + 법정선
    fig, ax = plt.subplots(figsize=(12, 5))
    max_emp = int(df["emp"].max()) if df["emp"].notna().any() else 100
    bins = np.logspace(0, np.log10(max_emp + 10), 20)
    for label in SIZE_ORDER:
        g = df[df["size"] == label]["emp"].dropna()
        if len(g) > 0:
            ax.hist(g, bins=bins, label=f"{label} (n={len(g)})",
                    color=SIZE_COLORS[label], alpha=0.6, edgecolor="white", linewidth=0.5)
    ax.axvline(SANGONGIN_EMP_10, color=PALETTE["bad"], linestyle="--",
               label=f"소상공인 상한(제조군) {SANGONGIN_EMP_10}명")
    ax.axvline(SANGONGIN_EMP_ETC, color=PALETTE["warn"], linestyle="--",
               label=f"소상공인 상한(기타) {SANGONGIN_EMP_ETC}명")
    ax.set_xscale("log")
    ax.set_xlabel("종업원수 (명, 로그 스케일)")
    ax.set_ylabel("기업 수")
    ax.legend(fontsize=9)
    ax.set_title(f"규모별 종업원수 분포 vs 법정 임계선 (기업 {n}개)")
    save_fig(fig, CAT, "employee_by_size_hist", "규모별 종업원수 히스토그램")

    # (2) 규모별 매출액 CDF + 1,500억선
    fig, ax = plt.subplots(figsize=(12, 5))
    for label in SIZE_ORDER:
        g = df[df["size"] == label]["rev3y"].dropna().sort_values()
        if len(g) > 1:
            cdf = np.arange(1, len(g) + 1) / len(g)
            ax.plot(g.values / EOK, cdf, label=f"{label} (n={len(g)})",
                    color=SIZE_COLORS[label], linewidth=2, marker="o", markersize=4)
    ax.axvline(SME_REVENUE_CEILING / EOK, color=PALETTE["bad"], linestyle="--",
               label=f"중소 상한 {_eok(SME_REVENUE_CEILING)}")
    ax.set_xscale("log")
    ax.set_xlabel("매출액 3년평균 (억, 로그 스케일)")
    ax.set_ylabel("누적 비율")
    ax.legend(fontsize=9)
    ax.set_title("규모별 매출액 CDF vs 중소 졸업선")
    save_fig(fig, CAT, "revenue_by_size_cdf", "규모별 매출액 CDF")

    # (3) 종업원수 × 매출액 산점도 (규모별)
    fig, ax = plt.subplots(figsize=(11, 6))
    for label in SIZE_ORDER:
        g = df[df["size"] == label].dropna(subset=["emp", "rev3y"])
        if len(g) > 0:
            ax.scatter(g["emp"], g["rev3y"] / EOK,
                       s=80, alpha=0.7, color=SIZE_COLORS[label], label=f"{label} (n={len(g)})",
                       edgecolors="white", linewidth=1)
    ax.axvline(SANGONGIN_EMP_10, color=PALETTE["bad"], linestyle=":", alpha=0.5)
    ax.axhline(SME_REVENUE_CEILING / EOK, color=PALETTE["bad"], linestyle=":", alpha=0.5)
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlabel("종업원수 (명, 로그)")
    ax.set_ylabel("매출액 3년평균 (억, 로그)")
    ax.legend(fontsize=9)
    ax.set_title("종업원수 × 매출액 산점도 (규모별)")
    save_fig(fig, CAT, "emp_vs_revenue_scatter", "규모 × 종업원 × 매출액")

    # meta
    images = [
        {"file": "employee_by_size_hist.png", "caption": "규모별 종업원수 분포"},
        {"file": "revenue_by_size_cdf.png", "caption": "규모별 매출액 CDF"},
        {"file": "emp_vs_revenue_scatter.png", "caption": "종업원수 × 매출액 산점도"},
    ]
    # 하이라이트 자동 산출 — 임계선 위반 및 표본 편향 감지
    highlights = []
    for label in SIZE_ORDER:
        g = df[df["size"] == label]["emp"].dropna()
        if len(g) > 0 and g.max() >= SANGONGIN_EMP_10 and label == "소상공인":
            highlights.append(f"소상공인 신고인데 종업원 {int(g.max())}명 관측 — 법정 상한 초과 사례")
    n_sizes = df["size"].value_counts()
    if any(cnt < 3 for cnt in n_sizes) and n > 20:
        smalls = [f"{s}({c})" for s, c in n_sizes.items() if c < 3]
        highlights.append(f"표본 극소 규모: {', '.join(smalls)} — 백분위 계산 시 신뢰도 낮음")

    status = "warn" if highlights else "good"
    write_meta(CAT, title="기업규모 경계값 실측",
               description="규모별 종업원수·매출액 실 분포를 법정 임계선과 대조. 표본 편향·임계선 위반 진단.",
               images=images, highlights=highlights, status=status)


if __name__ == "__main__":
    main()

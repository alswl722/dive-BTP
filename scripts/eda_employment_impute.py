"""종업원수 ↔ 국민연금 가입자수 상관 EDA — 결측 시 상호 대체 정책 근거.

방침:
    결측치 처리 전략 문서(§종업원수, §국민연금 가입자수)의 "한쪽 결측 시 다른 쪽으로
    대체" 규칙과 "둘 다 결측 시 규모별 평균 대체(개인의견)" 항목의 실증 근거.

    ⚠️ 읽기 전용. 상관·오차 통계만 산출, 실제 값 대체는 ETL에서.

세 가지를 본다:
    1. 종업원수 vs 국민연금 가입자수 상관관계 (연도별)
    2. 한쪽 값으로 다른 쪽 대체 시 오차 분포
    3. 규모별 종업원수·가입자수 평균/중앙값 (대체값 후보)

사용:
    python scripts/eda_employment_impute.py [--kodata <path.xlsx>]
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
from company_size_checks import SIZE_ORDER  # noqa: E402
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


def main() -> None:
    ap = argparse.ArgumentParser(description="종업원수 ↔ 국민연금 가입자수 상관 (읽기 전용)")
    ap.add_argument("--kodata", default=str(DEFAULT_KODATA))
    args = ap.parse_args()
    path = Path(args.kodata)
    if not path.exists():
        sys.exit(f"❌ 파일 없음: {path}")

    static_df, yearly_df = parse_company_info(str(path))
    n_static = len(static_df)

    print("=" * 72)
    print(f"종업원수 ↔ 국민연금 가입자수 상관 EDA — {path.name}")
    print("=" * 72)

    # 관측된 컬럼명 감지
    emp_col = "종업원수" if "종업원수" in yearly_df.columns else None
    sub_col = "국민연금 가입자수" if "국민연금 가입자수" in yearly_df.columns else "국민연금가입자수"
    if sub_col not in yearly_df.columns:
        sub_col = None

    if not emp_col or not sub_col:
        print(f"⚠️ 필요한 컬럼 없음 (종업원수={emp_col}, 국민연금 가입자수={sub_col}). 스킵.")
        write_meta("05_employment_impute",
                   title="종업원수 ↔ 국민연금 상관",
                   description="필요 컬럼 없음 — 실행 결과 없음",
                   images=[], highlights=["종업원수 또는 국민연금 컬럼 미검출"], status="info")
        return

    d = yearly_df[["기업일련번호", "year", emp_col, sub_col]].copy()
    d[emp_col] = pd.to_numeric(d[emp_col], errors="coerce")
    d[sub_col] = pd.to_numeric(d[sub_col], errors="coerce")

    # ── 1. 상관 (연도별 · 전체) ──────────────────────────────────
    _head("[1] 종업원수 vs 국민연금 가입자수 상관")
    both = d.dropna(subset=[emp_col, sub_col])
    if len(both) < 3:
        print("  유효 관측치 3개 미만 — 상관 계산 불가")
        corr_all = None
        yearly_corr = pd.Series(dtype=float)
    else:
        corr_all = both[emp_col].corr(both[sub_col])
        print(f"  전체 상관계수 (Pearson): {corr_all:.3f}  (n={len(both)})")
        yearly_corr = both.groupby("year").apply(lambda g: g[emp_col].corr(g[sub_col]) if len(g) >= 3 else np.nan)
        print("\n  연도별:")
        for y, c in yearly_corr.items():
            print(f"    {int(y)}: {c:.3f}" if pd.notna(c) else f"    {int(y)}: 표본 부족")

    # ── 2. 상호 대체 시 오차 ─────────────────────────────────────
    _head("[2] 한쪽으로 다른 쪽 대체 시 오차 (동일 행에서 두 값 다 있을 때)")
    if len(both) > 0:
        diff = both[emp_col] - both[sub_col]
        rel = (diff / both[emp_col].replace(0, np.nan)).abs()
        print(f"  절대 차이 (종업원수 - 가입자수): median={diff.median():.1f}, "
              f"|median|={diff.abs().median():.1f}, max={diff.abs().max():.0f}")
        print(f"  상대 오차 |diff/emp|: median={rel.median():.1%}, P75={rel.quantile(0.75):.1%}")
        print(f"  → 한쪽 결측 시 다른 쪽으로 대체 정책은 상관 {corr_all:.2f} · 오차 median {rel.median():.1%} 근거로 판단.")

    # ── 3. 규모별 평균 (대체값 후보) ─────────────────────────────
    _head("[3] 규모별 종업원수·가입자수 (둘 다 결측 시 규모별 평균 대체 옵션 근거)")
    size_map = static_df.set_index("기업일련번호")["기업규모(대/중/소)"].to_dict()
    d_size = d.assign(size=d["기업일련번호"].map(size_map)).dropna(subset=["size"])
    print(f"{'규모':6s} {'종업원 median':>14s} {'종업원 mean':>13s} {'가입자 median':>14s} {'가입자 mean':>13s}  n_기업")
    size_stats = {}
    for label in SIZE_ORDER:
        g = d_size[d_size["size"] == label]
        if len(g) == 0:
            continue
        e_med, e_mean = g[emp_col].median(), g[emp_col].mean()
        s_med, s_mean = g[sub_col].median(), g[sub_col].mean()
        n_c = g["기업일련번호"].nunique()
        print(f"{label:6s} {e_med:>13.1f}  {e_mean:>12.1f}  {s_med:>13.1f}  {s_mean:>12.1f}  {n_c}")
        size_stats[label] = {"emp_median": e_med, "emp_mean": e_mean,
                             "sub_median": s_med, "sub_mean": s_mean, "n": n_c}

    _render_visualizations(both, d_size, yearly_corr, size_stats,
                           emp_col, sub_col, corr_all, n_static)


def _render_visualizations(both, d_size, yearly_corr, size_stats,
                            emp_col, sub_col, corr_all, n_static) -> None:
    viz_setup()
    CAT = "05_employment_impute"

    # (1) 종업원수 vs 국민연금 산점도 + y=x 대각선
    if len(both) > 0:
        fig, ax = plt.subplots(figsize=(9, 8))
        colors_by_size = None
        if "size" in d_size.columns:
            d_scatter = d_size.dropna(subset=[emp_col, sub_col])
            for label in SIZE_ORDER:
                g = d_scatter[d_scatter["size"] == label]
                if len(g) > 0:
                    ax.scatter(g[emp_col], g[sub_col], s=60, alpha=0.6,
                               color=SIZE_COLORS[label], label=f"{label} (n={len(g)})",
                               edgecolors="white", linewidth=0.8)
        else:
            ax.scatter(both[emp_col], both[sub_col], s=60, alpha=0.6, color=PALETTE["primary"])
        # y=x
        max_v = max(both[emp_col].max(), both[sub_col].max())
        ax.plot([0, max_v], [0, max_v], color="gray", linestyle="--", alpha=0.5, label="y = x (완전 일치)")
        ax.set_xlabel("종업원수 (명)")
        ax.set_ylabel("국민연금 가입자수 (명)")
        title_corr = f" · Pearson r={corr_all:.3f}" if corr_all is not None else ""
        ax.set_title(f"종업원수 vs 국민연금 가입자수 (n={len(both)}{title_corr})")
        ax.legend(fontsize=9)
        save_fig(fig, CAT, "employee_vs_pension_scatter", "종업원수 vs 국민연금 산점도")

    # (2) 연도별 상관계수 line
    if len(yearly_corr) > 0:
        fig, ax = plt.subplots(figsize=(10, 4.5))
        yc = yearly_corr.dropna()
        ax.plot(yc.index.astype(int), yc.values, marker="o", color=PALETTE["primary"], linewidth=2, markersize=8)
        ax.axhline(0.9, color=PALETTE["good"], linestyle=":", alpha=0.5, label="r=0.9 (매우 강함)")
        ax.axhline(0.7, color=PALETTE["warn"], linestyle=":", alpha=0.5, label="r=0.7 (강함)")
        ax.set_ylim(0, 1.05)
        ax.set_xlabel("연도")
        ax.set_ylabel("상관계수 (Pearson)")
        ax.legend(fontsize=9, loc="lower right")
        ax.set_title("연도별 종업원수 ↔ 국민연금 상관")
        save_fig(fig, CAT, "correlation_by_year", "연도별 상관")

    # (3) 규모별 대체값 후보 (median/mean 병렬 bar)
    if size_stats:
        fig, ax = plt.subplots(figsize=(11, 5))
        labels = list(size_stats.keys())
        x = np.arange(len(labels))
        w = 0.2
        e_med = [size_stats[k]["emp_median"] for k in labels]
        e_mean = [size_stats[k]["emp_mean"] for k in labels]
        s_med = [size_stats[k]["sub_median"] for k in labels]
        s_mean = [size_stats[k]["sub_mean"] for k in labels]
        ax.bar(x - 1.5*w, e_med, w, label="종업원 median", color=PALETTE["primary"], alpha=0.9)
        ax.bar(x - 0.5*w, e_mean, w, label="종업원 mean", color=PALETTE["primary"], alpha=0.5)
        ax.bar(x + 0.5*w, s_med, w, label="가입자 median", color=PALETTE["info"], alpha=0.9)
        ax.bar(x + 1.5*w, s_mean, w, label="가입자 mean", color=PALETTE["info"], alpha=0.5)
        ax.set_xticks(x)
        ax.set_xticklabels(labels)
        ax.set_ylabel("인원 (명)")
        ax.legend(fontsize=9)
        ax.set_title("규모별 종업원수·국민연금 가입자수 (둘 다 결측 시 대체값 후보)")
        save_fig(fig, CAT, "group_mean_impute_options", "규모별 대체값 후보")

    # meta
    images = []
    if len(both) > 0:
        images.append({"file": "employee_vs_pension_scatter.png",
                       "caption": f"산점도 (n={len(both)}, r={corr_all:.3f})" if corr_all is not None
                                    else f"산점도 (n={len(both)})"})
    if len(yearly_corr) > 0:
        images.append({"file": "correlation_by_year.png", "caption": "연도별 상관계수"})
    if size_stats:
        images.append({"file": "group_mean_impute_options.png", "caption": "규모별 대체값 후보"})

    highlights = []
    if corr_all is not None:
        if corr_all >= 0.9:
            highlights.append(f"상관계수 r={corr_all:.2f} — 매우 강함, 상호 대체 정당")
        elif corr_all >= 0.7:
            highlights.append(f"상관계수 r={corr_all:.2f} — 강함, 대체 시 오차 감안")
        else:
            highlights.append(f"⚠️ 상관계수 r={corr_all:.2f} — 낮음, 상호 대체 신중")

    status = "good" if (corr_all is not None and corr_all >= 0.9) else ("warn" if corr_all is not None else "info")
    write_meta(CAT, title="종업원수 ↔ 국민연금 상관",
               description="한쪽 결측 시 다른 쪽으로 대체할 수 있는지, 규모별 평균 대체 후보값이 얼마인지 실측.",
               images=images, highlights=highlights, status=status)


if __name__ == "__main__":
    main()

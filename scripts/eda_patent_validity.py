"""특허 등록유효여부 케이스 분석 EDA — 결측 대체 규칙 근거.

방침:
    결측치 처리 전략 문서(§등록유효여부)의 표(존속기간 만료 / 기간 내 N / 임의 대체 여부)를
    실데이터로 자동 산출. 존속기간(특허 20 · 실용신안 10 · 상표 10년) 규칙으로 만료 판정.

    ⚠️ 읽기 전용. 대체 규칙은 이 EDA 결과 검토 후 팀 합의로 결정.

세 가지를 본다:
    1. 등록상태 × 유효여부 크로스탭 (공개/등록 × Y/N 분포)
    2. 출원경과년수 histogram (지적재산권 종류별)
    3. 존속기간 만료 판정 성공 vs 실패 (기간 내인데 N인 예외 케이스 카운트)

사용:
    python scripts/eda_patent_validity.py [--kodata <path.xlsx>]
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
SHEET = "2. 특허및실용신안"

# 존속기간 (출원일 기준 만료 기간, 년)
LIFESPAN = {
    "특허권":     20,
    "실용신안권": 10,
    "상표권":     10,
    "디자인권":   20,   # 디자인권 20년 (2014 이후 등록)
}


def _head(t: str) -> None:
    print(f"\n{'─' * 72}\n{t}\n{'─' * 72}")


def main() -> None:
    ap = argparse.ArgumentParser(description="특허 유효여부 케이스 분석 (읽기 전용)")
    ap.add_argument("--kodata", default=str(DEFAULT_KODATA))
    args = ap.parse_args()
    path = Path(args.kodata)
    if not path.exists():
        sys.exit(f"❌ 파일 없음: {path}")

    try:
        df = parse_simple_sheet(str(path), SHEET, 2)
    except Exception as e:  # noqa: BLE001
        print(f"⚠️ 시트 로드 실패: {e}")
        write_meta("06_patent_validity", title="특허 유효여부 케이스",
                   description="시트 로드 실패", images=[],
                   highlights=[f"오류: {e}"], status="info")
        return

    n = len(df)
    print("=" * 72)
    print(f"특허 유효여부 케이스 EDA — {path.name}  (특허 {n}건)")
    print("=" * 72)

    # 컬럼명 감지
    col_type = next((c for c in df.columns if "지적재산권" in c or "종류" in c), None)
    col_stat = next((c for c in df.columns if c == "등록상태" or "상태" in c), None)
    col_appl = next((c for c in df.columns if "출원일" in c), None)
    col_reg = next((c for c in df.columns if "등록일" in c), None)
    col_valid = next((c for c in df.columns if "유효여부" in c or "유효" in c), None)

    if not all([col_stat, col_appl, col_valid]):
        print(f"⚠️ 필요 컬럼 감지 실패 (상태={col_stat}, 출원={col_appl}, 유효={col_valid})")
        return

    # ── 1. 등록상태 × 유효여부 크로스탭 ──────────────────────────
    _head("[1] 등록상태 × 등록유효여부 크로스탭")
    ct = pd.crosstab(df[col_stat].fillna("결측"), df[col_valid].fillna("결측"))
    print(ct.to_string())
    total = int(ct.sum().sum())
    print(f"\n  총 {total}건 · 결측: 상태 {int(df[col_stat].isna().sum())} · 유효 {int(df[col_valid].isna().sum())}")

    # ── 2. 출원경과년수 · 만료 판정 ──────────────────────────────
    _head("[2] 출원경과년수 (지적재산권 종류별) · 존속기간 만료 판정")
    df = df.copy()
    df["_appl_dt"] = pd.to_datetime(df[col_appl], errors="coerce")
    today = pd.Timestamp.now()
    df["_years"] = (today - df["_appl_dt"]).dt.days / 365.25
    df["_lifespan"] = df[col_type].map(LIFESPAN) if col_type else np.nan
    df["_expired"] = (df["_years"] > df["_lifespan"]).where(df["_lifespan"].notna())

    for tp in ["특허권", "실용신안권", "상표권", "디자인권"]:
        g = df[df[col_type] == tp] if col_type else pd.DataFrame()
        if len(g) == 0:
            continue
        print(f"  {tp:8s} n={len(g):3d}  출원경과 median={g['_years'].median():.1f}년  "
              f"만료(경과>{LIFESPAN[tp]}년) {int(g['_expired'].sum())}건")

    # ── 3. 예외 케이스 (기간 내인데 N) ───────────────────────────
    _head("[3] 예외 케이스 — 존속기간 내인데 유효=N (권리소멸·포기·무효·연차료 미납)")
    reg_mask = df[col_stat].astype(str).str.contains("등록", na=False)
    n_val_col = df[col_valid].astype(str).str.upper().eq("N")
    within_lifespan = df["_expired"] == False   # 만료 안 됐음
    exception = df[reg_mask & n_val_col & within_lifespan]
    print(f"  등록 · 유효=N · 존속기간 내 : {len(exception)}건")
    print(f"  등록 · 유효=N · 만료 판정   : {len(df[reg_mask & n_val_col & (df['_expired'] == True)])}건")
    print(f"  등록 · 유효=Y (전체)       : {len(df[reg_mask & df[col_valid].astype(str).str.upper().eq('Y')])}건")
    if len(exception) > 0:
        print(f"\n  → 예외 {len(exception)}건은 임의 대체 불가 (권리소멸/포기/무효/연차료 미납 등, 데이터로 판별 불가)")

    _render_visualizations(df, ct, exception, col_type, col_stat, col_valid, total)


def _render_visualizations(df, ct, exception, col_type, col_stat, col_valid, total) -> None:
    viz_setup()
    CAT = "06_patent_validity"

    # (1) 등록상태 × 유효여부 heatmap
    fig, ax = plt.subplots(figsize=(9, 5))
    im = ax.imshow(ct.values, cmap="Blues", aspect="auto")
    ax.set_xticks(range(len(ct.columns)))
    ax.set_xticklabels(ct.columns)
    ax.set_yticks(range(len(ct.index)))
    ax.set_yticklabels(ct.index)
    for i in range(ct.shape[0]):
        for j in range(ct.shape[1]):
            v = int(ct.iloc[i, j])
            color = "white" if v > ct.values.max() / 2 else "black"
            ax.text(j, i, str(v), ha="center", va="center", color=color, fontsize=12, fontweight="bold")
    ax.set_xlabel("등록유효여부")
    ax.set_ylabel("등록상태")
    plt.colorbar(im, ax=ax, label="건수")
    ax.set_title(f"등록상태 × 유효여부 크로스탭 (총 {total}건)")
    save_fig(fig, CAT, "status_by_validity", "등록상태 × 유효여부")

    # (2) 출원경과년수 histogram (지적재산권 종류별)
    if col_type and df["_years"].notna().any():
        fig, ax = plt.subplots(figsize=(11, 5))
        max_y = df["_years"].max()
        bins = np.arange(0, max_y + 2, 1)
        colors = {"특허권": PALETTE["primary"], "실용신안권": PALETTE["info"],
                  "상표권": PALETTE["warn"], "디자인권": PALETTE["good"]}
        for tp in ["특허권", "실용신안권", "상표권", "디자인권"]:
            g = df[df[col_type] == tp]["_years"].dropna()
            if len(g) > 0:
                ax.hist(g, bins=bins, label=f"{tp} (n={len(g)}, 존속 {LIFESPAN[tp]}년)",
                        color=colors[tp], alpha=0.6, edgecolor="white", linewidth=0.3)
                ax.axvline(LIFESPAN[tp], color=colors[tp], linestyle="--", alpha=0.5)
        ax.set_xlabel("출원경과년수")
        ax.set_ylabel("건수")
        ax.legend(fontsize=9)
        ax.set_title("출원경과년수 분포 · 종류별 존속기간 대비")
        save_fig(fig, CAT, "expiration_check", "출원경과 · 존속기간")

    # (3) 예외 케이스 요약 stacked bar (등록 · 유효N 세부 분류)
    reg_mask = df[col_stat].astype(str).str.contains("등록", na=False)
    n_val = df[col_valid].astype(str).str.upper().eq("N")
    y_val = df[col_valid].astype(str).str.upper().eq("Y")
    n_reg_y = int((reg_mask & y_val).sum())
    n_reg_n_expired = int((reg_mask & n_val & (df["_expired"] == True)).sum())
    n_reg_n_within = int((reg_mask & n_val & (df["_expired"] == False)).sum())
    n_reg_n_unknown = int((reg_mask & n_val & df["_expired"].isna()).sum())

    fig, ax = plt.subplots(figsize=(10, 4))
    labels = ["등록 케이스"]
    parts = [
        ("유효=Y", n_reg_y, PALETTE["good"]),
        ("N · 만료(설명 가능)", n_reg_n_expired, PALETTE["muted"]),
        ("N · 기간 내(예외)", n_reg_n_within, PALETTE["bad"]),
        ("N · 판단불가(경과값 없음)", n_reg_n_unknown, PALETTE["warn"]),
    ]
    left = 0
    for name, cnt, color in parts:
        if cnt > 0:
            ax.barh(labels, [cnt], left=[left], color=color, label=f"{name}: {cnt}")
            left += cnt
    ax.set_xlabel("건수")
    ax.legend(loc="lower right", fontsize=9)
    ax.set_title("등록 케이스 세부 분류 · 임의 대체 가능 여부 판별")
    save_fig(fig, CAT, "exception_cases", "등록 · 유효 세부 분류")

    # meta
    images = [
        {"file": "status_by_validity.png", "caption": f"등록상태 × 유효여부 (총 {total}건)"},
        {"file": "expiration_check.png", "caption": "출원경과 · 존속기간 대비"},
        {"file": "exception_cases.png", "caption": "등록 케이스 세부 · 임의 대체 판별"},
    ]
    highlights = []
    if len(exception) > 0:
        highlights.append(
            f"기간 내 유효=N 예외 {len(exception)}건 — 출원일자로 판별 불가 · 임의 대체 금지"
        )

    status = "warn" if len(exception) > 0 else "good"
    write_meta(CAT, title="특허 유효여부 케이스",
               description="등록상태 × 유효여부 크로스탭, 존속기간 규칙으로 만료 판정. 결측 대체 규칙 근거.",
               images=images, highlights=highlights, status=status)


if __name__ == "__main__":
    main()

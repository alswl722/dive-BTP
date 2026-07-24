"""재무 파생 결측 복원 진단 EDA — 실데이터 받자마자 1회 실행.

방침(합의됨):
    자산=부채+자본, 영업이익률=영업이익÷매출 은 회계 항등식(exact math)이라, 나머지
    두 값이 있으면 세 번째는 유일하게 결정된다 → 추정이 아니라 '계산'이라 채워도 안전.
    (기업규모#1의 유추와 다르다.)

    ⚠️ 읽기 전용 — DB·config에 쓰지 않는다. xlsx만 읽는다. 적재 전에도 동작.
    판정·복원 로직은 backend/etl/finance_recovery.py(SSOT)를 그대로 쓴다 — ETL과 동일.

세 가지를 본다:
    1. 컬럼별 결측률      — 복원이 얼마나 필요한지
    2. 항등식 복원 효과   — 복원 가능 건수 + 복원 후 잔여 결측
    3. 항등식 위반        — 값 다 있는데 자산≠부채+자본 등(데이터 품질 신호, 복원과 별개)

사용:
    python scripts/eda_finance_recovery.py                       # 샘플
    python scripts/eda_finance_recovery.py --kodata <실데이터.xlsx>   # 본선
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
for cand in (Path("/app/etl"), ROOT / "backend" / "etl"):
    if (cand / "finance_recovery.py").exists():
        sys.path.insert(0, str(cand))
        break

import pandas as pd  # noqa: E402

from parsers import parse_company_info  # noqa: E402
import finance_recovery as fr  # noqa: E402
from eda_viz import PALETTE, save_fig, setup as viz_setup, write_meta  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402

DEFAULT_KODATA = ROOT / "backend" / "etl" / "data" / "배포_샘플_KODATA_기업데이터_26-07-06.xlsx"


def _head(t: str) -> None:
    print(f"\n{'─' * 72}\n{t}\n{'─' * 72}")


def _miss_counts(df: pd.DataFrame) -> pd.Series:
    return pd.Series({c: int(pd.to_numeric(df[c], errors="coerce").isna().sum())
                      if c in df.columns else -1 for c in fr.COLS})


def main() -> None:
    ap = argparse.ArgumentParser(description="재무 파생 결측 복원 진단 (읽기 전용)")
    ap.add_argument("--kodata", default=str(DEFAULT_KODATA))
    args = ap.parse_args()
    path = Path(args.kodata)
    if not path.exists():
        sys.exit(f"❌ 파일 없음: {path}")

    _, yearly = parse_company_info(str(path))
    n = len(yearly)
    print("=" * 72)
    print(f"재무 파생 결측 복원 EDA — {path.name}  (기업×연도 {n}행)")
    print("=" * 72)

    # ── 1. 결측률 ────────────────────────────────────────────────
    _head("[1] 컬럼별 결측률 (기업×연도)")
    before = _miss_counts(yearly)
    for c in fr.COLS:
        m = before[c]
        print(f"  {c:8s}: 결측 {m:4d}/{n} ({100 * m / n:.1f}%)")

    # ── 2. 복원 효과 ─────────────────────────────────────────────
    _head("[2] 항등식 복원 효과 (자산=부채+자본 / 영업이익률=영업이익÷매출)")
    recovered, audit = fr.recover_financial_identities(yearly)
    if audit:
        for rule, cnt in audit.items():
            print(f"  ✓ {rule}: {cnt}건 복원")
    else:
        print("  복원 가능한 결측 없음 (셋 중 둘이 갖춰진 결측 케이스 0)")

    after = _miss_counts(recovered)
    print("\n  복원 전→후 잔여 결측:")
    for c in fr.COLS:
        b, a = before[c], after[c]
        mark = f"  ↓{b - a}" if b != a else ""
        print(f"    {c:8s}: {b:4d} → {a:4d}{mark}")
    total_b, total_a = int(before.sum()), int(after.sum())
    print(f"\n  합계 결측: {total_b} → {total_a} "
          f"({100 * (total_b - total_a) / total_b:.1f}% 감소)" if total_b else "  (결측 0)")

    # ── 3. 항등식 위반 (품질 신호) ───────────────────────────────
    _head("[3] 항등식 위반 — 값 다 있는데 안 맞음 (데이터 품질 신호)")
    viol = fr.identity_violations(yearly)
    if any(viol.values()):
        for k, v in viol.items():
            print(f"  ⚠️ {k}: {v}건 (원본 데이터 자체가 항등식을 안 지킴 — 복원 대상 아님)")
    else:
        print("  ✓ 값이 다 있는 행에서 항등식 위반 없음 (복원 산수 신뢰 가능)")

    # ── 시각화 저장 ─────────────────────────────────────────────
    _render_visualizations(before, after, audit, viol, n)


def _render_visualizations(before: pd.Series, after: pd.Series,
                            audit: dict, viol: dict, n: int) -> None:
    viz_setup()
    CAT = "02_finance_recovery"

    # (1) 복원 전/후 결측률 grouped bar
    fig, ax = plt.subplots(figsize=(12, 5))
    x = list(fr.COLS)
    pos = range(len(x))
    b_pct = [100 * before[c] / n for c in x]
    a_pct = [100 * after[c] / n for c in x]
    w = 0.35
    ax.bar([p - w/2 for p in pos], b_pct, w, label="복원 전", color=PALETTE["muted"])
    ax.bar([p + w/2 for p in pos], a_pct, w, label="복원 후", color=PALETTE["good"])
    for i, (b, a) in enumerate(zip(b_pct, a_pct)):
        if b != a:
            ax.annotate(f"↓{b-a:.0f}%p", xy=(i + w/2, a), xytext=(0, 3),
                        textcoords="offset points", ha="center", fontsize=9,
                        color=PALETTE["good"], fontweight="bold")
    ax.set_xticks(list(pos))
    ax.set_xticklabels(x, rotation=15, ha="right")
    ax.set_ylabel("결측률 (%)")
    ax.legend()
    ax.set_title(f"재무 6개 컬럼 결측률 · 항등식 복원 전/후 (총 {n}행)")
    save_fig(fig, CAT, "missing_before_after", "재무 결측률 복원 효과")

    # (2) rule별 복원 건수 bar
    if audit:
        fig, ax = plt.subplots(figsize=(10, 4.5))
        rules = list(audit.keys())
        counts = list(audit.values())
        bars = ax.bar(rules, counts, color=PALETTE["primary"])
        for b, c in zip(bars, counts):
            ax.text(b.get_x() + b.get_width()/2, c + max(counts)*0.02, str(c),
                    ha="center", fontsize=11, fontweight="bold")
        ax.set_ylabel("복원 건수")
        ax.set_title(f"항등식 규칙별 복원 건수 (총 {sum(counts)}건)")
        plt.xticks(rotation=15, ha="right")
        save_fig(fig, CAT, "recovery_by_rule", "규칙별 복원 건수")

    # (3) 항등식 위반 (있을 때만)
    if any(viol.values()):
        fig, ax = plt.subplots(figsize=(10, 4))
        keys = list(viol.keys())
        vals = list(viol.values())
        colors = [PALETTE["bad"] if v > 0 else PALETTE["muted"] for v in vals]
        bars = ax.bar(keys, vals, color=colors)
        for b, c in zip(bars, vals):
            ax.text(b.get_x() + b.get_width()/2, c + max(vals, default=1)*0.02, str(c),
                    ha="center", fontsize=11, fontweight="bold")
        ax.set_ylabel("위반 건수")
        ax.set_title("항등식 위반 — 원본 데이터 품질 신호")
        plt.xticks(rotation=10, ha="right")
        save_fig(fig, CAT, "identity_violations", "항등식 위반")

    # meta.json
    images = [{"file": "missing_before_after.png",
               "caption": f"재무 6개 컬럼 결측률 · 복원 전후 (총 {n}행)"}]
    if audit:
        images.append({"file": "recovery_by_rule.png",
                       "caption": f"규칙별 복원 건수 (총 {sum(audit.values())}건)"})
    if any(viol.values()):
        images.append({"file": "identity_violations.png",
                       "caption": f"항등식 위반 {sum(viol.values())}건"})

    highlights = []
    total_recovered = sum(audit.values()) if audit else 0
    if total_recovered:
        highlights.append(f"항등식 복원 총 {total_recovered}건 — 결측 감소")
    if any(viol.values()):
        highlights.append(f"항등식 위반 {sum(viol.values())}건 — 원본 데이터 품질 검토 필요")

    status = "warn" if any(viol.values()) else ("good" if total_recovered else "info")
    write_meta(CAT, title="재무 항등식 복원",
               description="자산=부채+자본, 영업이익률=영업이익÷매출 항등식으로 결측 복원 + 원본 위반 탐지.",
               images=images, highlights=highlights, status=status)


if __name__ == "__main__":
    main()

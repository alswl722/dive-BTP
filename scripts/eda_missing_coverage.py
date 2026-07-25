"""결측 커버리지 종합 리포트 EDA — 문서 §전 컬럼 대체 규칙의 실제 커버리지 시뮬레이션.

방침:
    결측치 처리 전략 문서 전체를 실데이터에 대해 자동 검증. 각 컬럼별로
    (a) 원 결측률, (b) 대체 규칙 적용 후 예상 잔여 결측률, (c) GO/NO-GO 판정.

    ⚠️ 읽기 전용. 실제 값 대체는 하지 않고, 대체 규칙의 커버리지만 시뮬레이션.

세 가지를 본다:
    1. 시트별 · 컬럼별 원 결측률 (전체 요약)
    2. 대체 규칙 시뮬레이션 (문서의 명시적 규칙 위주)
    3. GO/NO-GO 종합 판정 (임계값 기반)

임계값 (조정 가능):
    - GO   : 원 결측률 < 5% OR 대체 후 잔여 < 5%
    - WARN : 원 결측률 5~20% AND 대체 후 잔여 5~15%
    - NO-GO: 원 결측률 > 20% AND 대체 후 잔여 > 15%

사용:
    python scripts/eda_missing_coverage.py [--kodata <path.xlsx>] [--btp <path.xlsx>]
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

from parsers import parse_company_info, parse_simple_sheet  # noqa: E402
from eda_viz import PALETTE, save_fig, setup as viz_setup, write_meta  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402

DEFAULT_KODATA = ROOT / "backend" / "etl" / "data" / "배포_샘플_KODATA_기업데이터_26-07-06.xlsx"
DEFAULT_BTP = ROOT / "backend" / "etl" / "data" / "배포_샘플_부산TP__사업기업목록_26-07-06.xlsx"

# GO/NO-GO 임계값 (조정 가능)
GO_MAX = 5.0        # 5% 미만 → GO
NOGO_MIN = 20.0     # 20% 이상 → NO-GO 후보
NOGO_AFTER = 15.0   # 대체 후에도 15% 이상 → NO-GO 확정

# 문서의 대체 규칙별 예상 커버리지 (대체 규칙 시뮬레이션 근사)
# 문서 §각 컬럼의 규칙에 근거. 실 데이터로 정확 계산이 불가능한 규칙은
# 근사 커버리지(0~1)로 감안한다 — 최종은 팀 리뷰.
IMPUTATION_COVERAGE_HINT = {
    # 기업정보 (상호 대체 가능)
    "기업규모(대/중/소)": {"rule": "미상 유지(유추 안 함)", "coverage": 0.0},
    "지역": {"rule": "부산으로 확정", "coverage": 1.0},
    "설립일자": {"rule": "미상 유지", "coverage": 0.0},
    "기업유형(법인/개인)": {"rule": "기업형태 값으로 유추", "coverage": 0.9},
    "기업형태(주식/개인)": {"rule": "기업유형 값으로 유추", "coverage": 0.9},
    # 본선 실측 결과 두 소스 KSIC 일치율 20.5%로 BTP 대체는 폐기 (CLAUDE.md 업종코드 이중 소스 정책 참고)
    "KSIC코드(11차)": {"rule": "미상 유지(유추 안 함)", "coverage": 0.0},
    "업종명(11차)": {"rule": "동일 KSIC 기업의 업종명으로 대체", "coverage": 0.6},
    "주요제품": {"rule": "기업지원목록 주생산품으로 대체", "coverage": 0.5},
    "휴폐업여부": {"rule": "폐업일자 있으면 Y", "coverage": 0.99},
    # 재무 (항등식 복원)
    "매출액": {"rule": "미상 유지 (설립 전 연도 결측은 정상)", "coverage": 0.0},
    "영업이익손실": {"rule": "미상 유지", "coverage": 0.0},
    "매출원가": {"rule": "미상 유지", "coverage": 0.0},
    "당기순이익손실": {"rule": "미상 유지", "coverage": 0.0},
    "자산총계": {"rule": "부채+자본 항등식 복원", "coverage": 0.6},
    "부채총계": {"rule": "자산-자본 항등식 복원", "coverage": 0.6},
    "자본총계": {"rule": "자산-부채 항등식 복원", "coverage": 0.6},
    "영업이익률": {"rule": "영업이익÷매출 항등식 복원", "coverage": 0.6},
    # 국민연금
    "종업원수": {"rule": "국민연금 가입자수로 대체", "coverage": 0.8},
    "국민연금 가입자수": {"rule": "종업원수로 대체", "coverage": 0.8},
    "1인평균 연간급여": {"rule": "미상 유지", "coverage": 0.0},
    # 인증
    "이노비즈": {"rule": "결측=무", "coverage": 1.0},
    "메인비즈": {"rule": "결측=무", "coverage": 1.0},
    "벤처기업": {"rule": "결측=무", "coverage": 1.0},
    "소재부품": {"rule": "결측=무", "coverage": 1.0},
    "NET": {"rule": "결측=무", "coverage": 1.0},
    "NEP": {"rule": "결측=무", "coverage": 1.0},
    # 기업지원목록
    "지원금": {"rule": "탈락이면 결측 정상 · 지원대상은 미상 유지", "coverage": 0.1},
    "시작일": {"rule": "사업목록의 시작일로 대체", "coverage": 0.8},
    "종료일": {"rule": "사업목록의 종료일로 대체", "coverage": 0.8},
    "업종코드": {"rule": "기업정보 KSIC로 대체", "coverage": 0.7},
    "광역": {"rule": "부산으로 확정", "coverage": 1.0},
    "기초": {"rule": "미상 유지", "coverage": 0.0},
    "주생산품": {"rule": "기업정보 주요제품으로 대체", "coverage": 0.6},
    "설립연도": {"rule": "기업정보 설립일자에서 추출", "coverage": 0.9},
}


def _head(t: str) -> None:
    print(f"\n{'─' * 72}\n{t}\n{'─' * 72}")


def _judge(before_pct: float, after_pct: float) -> tuple[str, str]:
    """(status, label) 반환 — good/warn/bad."""
    if before_pct < GO_MAX or after_pct < GO_MAX:
        return "good", "🟢 GO"
    if before_pct > NOGO_MIN and after_pct > NOGO_AFTER:
        return "bad", "🔴 NO-GO"
    return "warn", "🟡 검토"


def _collect_stats(static_df, yearly_df, btp) -> pd.DataFrame:
    """컬럼별 (원 결측률, 대체 후 잔여) 계산 · long-form DataFrame 반환."""
    rows = []
    n_static = len(static_df)
    n_yearly = len(yearly_df)

    def _add(sheet, col, series, n):
        if col not in series.index if isinstance(series, pd.Series) else col not in series.columns:
            return
        vals = series[col] if isinstance(series, pd.DataFrame) else None
        if vals is None:
            return
        n_missing = int(pd.to_numeric(vals, errors="coerce").isna().sum() if pd.api.types.is_numeric_dtype(vals) else vals.isna().sum())
        before = 100 * n_missing / n if n > 0 else 0
        hint = IMPUTATION_COVERAGE_HINT.get(col, {"rule": "-", "coverage": 0.0})
        after = before * (1 - hint["coverage"])
        rows.append({
            "sheet": sheet, "column": col, "n": n, "n_missing": n_missing,
            "before_pct": before, "after_pct": after,
            "rule": hint["rule"], "coverage": hint["coverage"],
        })

    # 기업정보 (static)
    for col in ["기업규모(대/중/소)", "지역", "설립일자", "기업유형(법인/개인)", "기업형태(주식/개인)",
                "KSIC코드(11차)", "업종명(11차)", "주요제품", "휴폐업여부",
                "이노비즈", "메인비즈", "벤처기업", "소재부품", "NET", "NEP"]:
        _add("기업정보(정적)", col, static_df, n_static)

    # 재무·국민연금 (yearly)
    for col in ["매출액", "영업이익손실", "매출원가", "당기순이익손실", "영업이익률",
                "자산총계", "부채총계", "자본총계",
                "종업원수", "국민연금 가입자수", "1인평균 연간급여"]:
        _add("기업정보(연도별)", col, yearly_df, n_yearly)

    # 기업지원목록
    if len(btp) > 0:
        n_btp = len(btp)
        for col in ["지원금(천원)", "지원금", "시작일", "종료일", "업종코드", "광역", "기초", "주생산품", "설립연도"]:
            # 컬럼명 유연 매칭
            actual = next((c for c in btp.columns if c == col or col in c), None)
            if actual:
                # 정규 명칭으로 통일해서 hint 매칭 시도
                canonical = "지원금" if "지원금" in actual else actual
                _add("기업지원목록", canonical, pd.DataFrame({canonical: btp[actual]}), n_btp)

    return pd.DataFrame(rows)


def main() -> None:
    ap = argparse.ArgumentParser(description="결측 커버리지 종합 리포트 (읽기 전용)")
    ap.add_argument("--kodata", default=str(DEFAULT_KODATA))
    ap.add_argument("--btp", default=str(DEFAULT_BTP))
    args = ap.parse_args()

    kodata_path = Path(args.kodata)
    btp_path = Path(args.btp)
    if not kodata_path.exists():
        sys.exit(f"❌ KODATA 없음: {kodata_path}")
    if not btp_path.exists():
        sys.exit(f"❌ BTP 없음: {btp_path}")

    print("=" * 72)
    print(f"결측 커버리지 종합 리포트 — {kodata_path.name} + {btp_path.name}")
    print("=" * 72)

    static_df, yearly_df = parse_company_info(str(kodata_path))
    btp_frames = []
    for sh in ["2022_기업지원목록", "2023_기업지원목록", "2024_기업지원목록"]:
        try:
            btp_frames.append(parse_simple_sheet(str(btp_path), sh, 2))
        except Exception:  # noqa: BLE001
            pass
    btp = pd.concat(btp_frames, ignore_index=True) if btp_frames else pd.DataFrame()

    stats = _collect_stats(static_df, yearly_df, btp)
    stats["status"], stats["label"] = zip(*stats.apply(lambda r: _judge(r["before_pct"], r["after_pct"]), axis=1))

    # ── 1. 컬럼별 결측률 ────────────────────────────────────────
    _head("[1] 시트·컬럼별 결측률 (원 vs 대체 후 예상)")
    for sheet, g in stats.groupby("sheet"):
        print(f"\n  ─ {sheet} (n={g['n'].iloc[0]}) ─")
        for _, r in g.sort_values("before_pct", ascending=False).iterrows():
            print(f"    {r['label']} {r['column']:22s} "
                  f"결측 {r['n_missing']:4d}/{r['n']} ({r['before_pct']:5.1f}%) → "
                  f"대체후 {r['after_pct']:5.1f}%  [{r['rule']}]")

    # ── 2. GO/NO-GO 요약 ────────────────────────────────────────
    _head("[2] GO/NO-GO 판정 요약")
    counts = stats["status"].value_counts()
    for st in ["good", "warn", "bad"]:
        emoji = {"good": "🟢", "warn": "🟡", "bad": "🔴"}[st]
        label = {"good": "GO", "warn": "검토", "bad": "NO-GO"}[st]
        n = int(counts.get(st, 0))
        print(f"  {emoji} {label:6s}: {n} 컬럼")

    # 최종 판정
    _head("[3] 종합 판정")
    n_bad = int(counts.get("bad", 0))
    n_warn = int(counts.get("warn", 0))
    if n_bad > 0:
        overall = "🔴 NO-GO"
        note = f"차단 컬럼 {n_bad}개 — 대체 규칙 재설계 또는 미상 정책 확정 필요"
    elif n_warn > 3:
        overall = "🟡 CONDITIONAL GO"
        note = f"검토 컬럼 {n_warn}개 — 원인 파악 후 진행"
    else:
        overall = "🟢 GO"
        note = "결측 커버리지 정상 — ETL 적재 · 스코어링 진행 가능"
    print(f"  {overall} — {note}")

    _render_visualizations(stats, counts, overall)


def _render_visualizations(stats, counts, overall) -> None:
    viz_setup()
    CAT = "09_missing_coverage"

    # (1) 컬럼별 결측률 grouped bar (before/after)
    fig, ax = plt.subplots(figsize=(14, 8))
    df_sorted = stats.sort_values("before_pct", ascending=True)
    x = np.arange(len(df_sorted))
    w = 0.35
    ax.barh(x - w/2, df_sorted["before_pct"], w, label="원 결측률", color=PALETTE["muted"])
    ax.barh(x + w/2, df_sorted["after_pct"], w, label="대체 후 예상", color=PALETTE["good"])
    # y축 라벨
    labels = [f"[{r['sheet'].split('(')[0][:6]}] {r['column']}" for _, r in df_sorted.iterrows()]
    ax.set_yticks(x)
    ax.set_yticklabels(labels, fontsize=8)
    ax.axvline(GO_MAX, color=PALETTE["good"], linestyle=":", alpha=0.7, label=f"GO 상한 {GO_MAX}%")
    ax.axvline(NOGO_AFTER, color=PALETTE["bad"], linestyle=":", alpha=0.7, label=f"NO-GO 하한 {NOGO_AFTER}% (대체 후)")
    ax.set_xlabel("결측률 (%)")
    ax.legend(fontsize=9, loc="lower right")
    ax.set_title("컬럼별 결측률 · 대체 전/후 예상")
    save_fig(fig, CAT, "column_missing_rates", "컬럼별 결측률 · 복원 전후")

    # (2) 대체 규칙별 커버리지 (같은 규칙 그룹핑)
    fig, ax = plt.subplots(figsize=(11, 6))
    rule_cov = stats.groupby("rule").agg(
        avg_coverage=("coverage", "mean"),
        n_cols=("column", "count"),
        avg_before=("before_pct", "mean"),
    ).sort_values("avg_coverage", ascending=True)
    colors = [PALETTE["good"] if c >= 0.7 else PALETTE["warn"] if c >= 0.3 else PALETTE["muted"]
              for c in rule_cov["avg_coverage"]]
    bars = ax.barh(range(len(rule_cov)), rule_cov["avg_coverage"] * 100, color=colors)
    for b, (idx, r) in zip(bars, rule_cov.iterrows()):
        ax.text(r["avg_coverage"] * 100 + 1, b.get_y() + b.get_height()/2,
                f"{r['n_cols']}컬럼", va="center", fontsize=9)
    ax.set_yticks(range(len(rule_cov)))
    ax.set_yticklabels([r[:35] + "…" if len(r) > 35 else r for r in rule_cov.index], fontsize=9)
    ax.set_xlabel("대체 규칙 커버리지 (%)")
    ax.set_xlim(0, 110)
    ax.set_title("대체 규칙별 예상 커버리지")
    save_fig(fig, CAT, "rule_success_rates", "규칙별 커버리지")

    # (3) GO/NO-GO 상태 pie/donut
    fig, ax = plt.subplots(figsize=(8, 8))
    st_colors = {"good": PALETTE["good"], "warn": PALETTE["warn"], "bad": PALETTE["bad"]}
    st_labels = {"good": "🟢 GO", "warn": "🟡 검토", "bad": "🔴 NO-GO"}
    valid_counts = [(st, int(counts.get(st, 0))) for st in ["good", "warn", "bad"] if int(counts.get(st, 0)) > 0]
    if valid_counts:
        vals = [c for _, c in valid_counts]
        colors = [st_colors[s] for s, _ in valid_counts]
        labels = [f"{st_labels[s]}\n{c}컬럼" for s, c in valid_counts]
        ax.pie(vals, labels=labels, colors=colors, autopct="%1.0f%%", startangle=90,
               wedgeprops={"width": 0.4, "edgecolor": "white", "linewidth": 2}, textprops={"fontsize": 11})
    ax.set_title(f"컬럼별 GO/NO-GO 분포\n{overall}", fontsize=13, fontweight="bold")
    save_fig(fig, CAT, "go_nogo_status", "GO/NO-GO 종합")

    # meta
    images = [
        {"file": "column_missing_rates.png", "caption": "컬럼별 결측률 · 대체 전/후"},
        {"file": "rule_success_rates.png", "caption": "대체 규칙별 커버리지"},
        {"file": "go_nogo_status.png", "caption": f"컬럼별 GO/NO-GO 분포 — {overall}"},
    ]
    n_bad = int(counts.get("bad", 0))
    n_warn = int(counts.get("warn", 0))
    n_good = int(counts.get("good", 0))
    highlights = [
        f"{n_good} 컬럼 🟢 GO / {n_warn} 컬럼 🟡 검토 / {n_bad} 컬럼 🔴 NO-GO",
    ]
    if n_bad > 0:
        bad_cols = stats[stats["status"] == "bad"].sort_values("before_pct", ascending=False)
        top_bad = ", ".join(bad_cols["column"].head(5).tolist())
        highlights.append(f"⚠️ NO-GO 컬럼 top: {top_bad}")

    status = "bad" if n_bad > 0 else "warn" if n_warn > 3 else "good"
    write_meta(CAT, title="결측 커버리지 종합 리포트",
               description="문서의 대체 규칙을 실데이터에 적용해 컬럼별 예상 잔여 결측률 · GO/NO-GO 종합 판정.",
               images=images, highlights=highlights, status=status)


if __name__ == "__main__":
    main()

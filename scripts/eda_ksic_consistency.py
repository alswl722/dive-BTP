"""KSIC 코드 정합성 EDA — 기업정보 KSIC vs 기업지원목록 업종코드 대조.

방침:
    결측치 처리 전략 문서(§업종코드)의 "여기서의 코드랑 기업정보의 코드가 동일한 것도
    있고 다른 것도 있고, 동일기업도 행마다 업종코드가 달라짐" 문제를 실측한다.
    KSIC는 스코어링·LLM 판정의 근본 기준이라 정합성이 나쁘면 백분위 그룹핑이 오염된다.

    ⚠️ 읽기 전용. 어느 값을 신뢰할지는 이 EDA 결과 검토 후 팀 합의.

세 가지를 본다:
    1. 기업정보 KSIC 결측률 · 기업지원목록 업종코드 결측률
    2. 두 소스 대조 (동일 기업이 있는 기업 대상) — 완전일치·중분류일치·불일치
    3. 다중 KSIC 가진 기업 (기업지원목록에서 행마다 다른 코드 사용)

사용:
    python scripts/eda_ksic_consistency.py [--kodata <path.xlsx>] [--btp <path.xlsx>]
"""

from __future__ import annotations

import argparse
import re
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
BTP_SHEETS = ["2022_기업지원목록", "2023_기업지원목록", "2024_기업지원목록"]


def _head(t: str) -> None:
    print(f"\n{'─' * 72}\n{t}\n{'─' * 72}")


def _normalize_ksic(v) -> str | None:
    """KSIC 코드 정규화 — 2022는 숫자 5자리(42500), 2023+는 알파벳+숫자(C29199).
    비교를 위해 문자열 상단 3자(중분류)로 통일."""
    if pd.isna(v):
        return None
    s = str(v).strip().upper()
    if not s:
        return None
    # 5자리 숫자면 앞 3자
    if re.match(r"^\d{5}$", s):
        return s[:3]
    # 알파벳+숫자면 앞 3자 (예: C29 for C29199)
    if re.match(r"^[A-Z]\d", s):
        return s[:3]
    return s[:3] if len(s) >= 3 else s


def main() -> None:
    ap = argparse.ArgumentParser(description="KSIC 코드 정합성 대조 (읽기 전용)")
    ap.add_argument("--kodata", default=str(DEFAULT_KODATA))
    ap.add_argument("--btp", default=str(DEFAULT_BTP))
    args = ap.parse_args()

    kodata_path = Path(args.kodata)
    btp_path = Path(args.btp)
    if not kodata_path.exists():
        sys.exit(f"❌ KODATA 없음: {kodata_path}")
    if not btp_path.exists():
        sys.exit(f"❌ BTP 없음: {btp_path}")

    static_df, _ = parse_company_info(str(kodata_path))
    ksic_col = next((c for c in static_df.columns if "KSIC" in c), None)
    key_col = "기업일련번호"

    print("=" * 72)
    print(f"KSIC 코드 정합성 EDA — KODATA {kodata_path.name} vs BTP {btp_path.name}")
    print("=" * 72)

    if not ksic_col:
        print("⚠️ KODATA에 KSIC 컬럼 없음")
        return

    # BTP 3개 시트 합치기
    btp_frames = []
    for sh in BTP_SHEETS:
        try:
            btp_frames.append(parse_simple_sheet(str(btp_path), sh, 2))
        except Exception as e:  # noqa: BLE001
            print(f"  ⚠️ 시트 스킵 {sh}: {e}")
    btp = pd.concat(btp_frames, ignore_index=True) if btp_frames else pd.DataFrame()
    btp_ksic_col = next((c for c in btp.columns if "업종코드" in c or "KSIC" in c), None) if len(btp) else None

    # ── 1. 결측률 ────────────────────────────────────────────────
    _head("[1] 두 소스 KSIC 결측률")
    n_kodata = len(static_df)
    kodata_miss = int(static_df[ksic_col].isna().sum())
    print(f"  KODATA(기업정보) KSIC 결측: {kodata_miss}/{n_kodata} ({100 * kodata_miss / n_kodata:.1f}%)")

    if btp_ksic_col:
        n_btp = len(btp)
        btp_miss = int(btp[btp_ksic_col].isna().sum())
        print(f"  BTP(기업지원목록) 업종코드 결측: {btp_miss}/{n_btp} ({100 * btp_miss / n_btp:.1f}%)")
    else:
        print("  ⚠️ BTP에 업종코드 컬럼 없음 — 대조 불가")
        return

    # ── 2. 두 소스 대조 (동일 기업) ──────────────────────────────
    _head("[2] 동일 기업에서 두 소스 대조 — 중분류(앞 3자) 기준")
    kodata_map = static_df.set_index(key_col)[ksic_col].apply(_normalize_ksic).to_dict()
    btp["_ksic3"] = btp[btp_ksic_col].apply(_normalize_ksic)
    btp["_kodata_ksic3"] = btp[key_col].map(kodata_map)

    dual = btp.dropna(subset=["_ksic3", "_kodata_ksic3"])
    if len(dual) == 0:
        print("  ⚠️ 두 소스 모두 있는 행 없음")
        return
    dual["_match"] = dual["_ksic3"] == dual["_kodata_ksic3"]
    n_dual = len(dual)
    n_match = int(dual["_match"].sum())
    n_mismatch = n_dual - n_match
    print(f"  두 소스 모두 있는 지원레코드: {n_dual}건")
    print(f"    중분류 일치: {n_match} ({100 * n_match / n_dual:.1f}%)")
    print(f"    중분류 불일치: {n_mismatch} ({100 * n_mismatch / n_dual:.1f}%)")

    # 위 일치율은 "행" 기준이라 한 기업이 여러 건 지원하면 과소평가될 수 있음.
    # "기업당 하나라도 일치하는 행이 있는가" 기준으로 재계산.
    per_company_match = dual.groupby(key_col)["_match"].any()
    n_company_dual = len(per_company_match)
    n_company_match = int(per_company_match.sum())
    print(f"\n  [기업 단위 재계산] 두 소스 모두 있는 기업: {n_company_dual}개")
    print(f"    하나라도 일치하는 행 존재: {n_company_match} "
          f"({100 * n_company_match / n_company_dual:.1f}%)")

    # 불일치 예시 (기업당 1개씩만)
    if n_mismatch > 0:
        print("\n  불일치 사례 (기업당 첫 1건):")
        mm = dual[~dual["_match"]].drop_duplicates(subset=[key_col]).head(10)
        for _, r in mm.iterrows():
            print(f"    기업 {r[key_col]}: KODATA={r['_kodata_ksic3']} vs BTP={r['_ksic3']}")

    # ── 3. 다중 KSIC 기업 (BTP 내 행마다 다름) ───────────────────
    _head("[3] BTP 안에서 동일 기업이 여러 KSIC 코드 사용")
    per_company = btp.dropna(subset=["_ksic3"]).groupby(key_col)["_ksic3"].nunique()
    multi = per_company[per_company > 1]
    print(f"  BTP 참여 기업: {per_company.count()}개")
    print(f"  다중 KSIC 사용 기업: {len(multi)}개 ({100 * len(multi) / len(per_company):.1f}%)")
    if len(multi) > 0:
        print("\n  다중 KSIC 기업 예시 (상위 10):")
        for cid, cnt in multi.sort_values(ascending=False).head(10).items():
            codes = sorted(btp[btp[key_col] == cid]["_ksic3"].dropna().unique())
            print(f"    기업 {cid}: {cnt}종류 ({', '.join(codes)})")

    _render_visualizations(kodata_miss, btp_miss, n_kodata, n_btp,
                            n_match, n_mismatch, per_company, multi)


def _render_visualizations(kodata_miss, btp_miss, n_kodata, n_btp,
                            n_match, n_mismatch, per_company, multi) -> None:
    viz_setup()
    CAT = "08_ksic_consistency"

    # (1) 두 소스 결측률 + 대조 결과 stacked bar
    fig, ax = plt.subplots(figsize=(11, 5))
    labels = ["KODATA\n(기업정보)", "BTP\n(기업지원목록)", "동일 기업 대조\n(두 소스)"]
    n_dual = n_match + n_mismatch
    bars_data = [
        ("결측", [kodata_miss, btp_miss, 0], PALETTE["muted"]),
        ("있음/일치", [n_kodata - kodata_miss, n_btp - btp_miss, n_match], PALETTE["good"]),
        ("불일치", [0, 0, n_mismatch], PALETTE["bad"]),
    ]
    bottom = np.zeros(3)
    for name, vals, color in bars_data:
        ax.bar(labels, vals, bottom=bottom, label=name, color=color)
        bottom += np.array(vals)
    for i, total_v in enumerate([n_kodata, n_btp, n_dual]):
        ax.text(i, total_v + max(n_kodata, n_btp) * 0.02, str(total_v),
                ha="center", fontsize=10, fontweight="bold")
    ax.set_ylabel("건수")
    ax.legend()
    ax.set_title(f"KSIC 결측 · 대조 요약 (일치율 {100 * n_match / max(n_dual, 1):.1f}%)")
    save_fig(fig, CAT, "ksic_match_rate", "KSIC 대조 요약")

    # (2) 다중 KSIC 기업 분포
    if len(per_company) > 0:
        fig, ax = plt.subplots(figsize=(10, 4.5))
        vc = per_company.value_counts().sort_index()
        colors = [PALETTE["good"] if k == 1 else PALETTE["warn"] if k <= 3 else PALETTE["bad"]
                  for k in vc.index]
        bars = ax.bar(vc.index.astype(str), vc.values, color=colors)
        for b, c in zip(bars, vc.values):
            pct = 100 * c / len(per_company)
            ax.text(b.get_x() + b.get_width()/2, c + max(vc.values)*0.02,
                    f"{c}\n({pct:.0f}%)", ha="center", fontsize=10)
        ax.set_xlabel("BTP 안에서 사용된 KSIC 코드 종류 수 (중분류)")
        ax.set_ylabel("기업 수")
        ax.set_title(f"BTP 안에서 다중 KSIC 사용 기업 분포 (BTP 참여 {len(per_company)}개)")
        save_fig(fig, CAT, "multi_code_companies", "다중 KSIC 기업")

    # meta
    images = [
        {"file": "ksic_match_rate.png", "caption": f"KSIC 대조 (일치율 {100 * n_match / max(n_match + n_mismatch, 1):.1f}%)"},
    ]
    if len(per_company) > 0:
        images.append({"file": "multi_code_companies.png",
                       "caption": f"다중 KSIC 사용 기업 {len(multi)}개"})

    highlights = []
    match_rate = n_match / max(n_match + n_mismatch, 1)
    if match_rate < 0.7:
        highlights.append(f"⚠️ 두 소스 KSIC 일치율 {match_rate:.1%} — 스코어링 기준 결정 필요")
    elif match_rate < 0.9:
        highlights.append(f"KSIC 일치율 {match_rate:.1%} — 불일치 케이스 검토 권장")
    if len(multi) > 0:
        pct = 100 * len(multi) / len(per_company)
        highlights.append(f"BTP에서 다중 KSIC 사용 기업 {len(multi)}개 ({pct:.0f}%) — 대체 규칙 신중")

    status = "bad" if match_rate < 0.5 else "warn" if match_rate < 0.9 else "good"
    write_meta(CAT, title="KSIC 코드 정합성",
               description="KODATA와 BTP 두 소스의 KSIC 코드 대조 · 다중 KSIC 사용 기업 진단.",
               images=images, highlights=highlights, status=status)


if __name__ == "__main__":
    main()

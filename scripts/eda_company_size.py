"""기업규모 결측 진단 + 신고값 정합성 EDA — 실데이터 받자마자 1회 실행.

방침(합의됨):
    - 결측 기업규모는 '유추해서 채우지 않는다'. 미상으로 두고 스코어링은 전체fallback.
      (추정값을 사실처럼 보여주는 위험 > 얻는 이득. 도구 철학 "사실 vs 주장"과 충돌)
    - 대신 '신고값 vs 실측 정합성'을 드러낸다 — 이건 값을 지어내지 않고 사실만 밝히므로
      위험이 없고 발제 축①(서류 vs 실제 역량 검증)에 직접 기여한다.

    ⚠️ 읽기 전용 — DB·parquet·config 어디에도 쓰지 않는다. xlsx만 읽는다.
       DB 적재 전에도 돌아간다(parse_company_info 재사용).

세 가지를 본다:
    1. 기업규모 결측률          — 얼마나 '미상'이 생기는지(전체fallback 대상 규모 파악)
    2. 규모별 종업원/매출 분포    — 신고 분포 감 잡기(정합성 경고 맥락)
    3. 정합성 경고             — '법으로 확정된' 모순만. 임계값을 지어내지 않는다.

정합성 판정(법 근거, 지어낸 숫자 0):
    (a) 소상공인 종업원 초과 — 소상공인 신고인데 종업원 ≥ 법정상한(제조·건설·운수 10 / 기타 5)
        · 소상공인보호법
    (b) 중소기업 졸업선 초과 — 소상공인/소기업/중기업 신고인데 3년평균 매출 > 1,500억
        (또는 자산 > 5,000억). 업종별 상한(400~1500억)의 최댓값을 넘으면 어느 업종이든
        중소기업이 아니다. · 중소기업기본법

사용:
    python scripts/eda_company_size.py                       # 샘플 데이터
    python scripts/eda_company_size.py --kodata <실데이터.xlsx>   # 본선

    ⚠️ 매출·자산 단위 = 천원 (1억 = 100,000천원). 판정 상수도 천원.
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
# 정합성 판정은 프로덕션(company_view)과 '같은 원본'을 공유한다 — 드리프트 방지.
import company_size_checks as chk  # noqa: E402
from company_size_checks import (  # noqa: E402
    SIZE_ORDER, SANGONGIN_EMP_10, SANGONGIN_EMP_ETC,
    SME_REVENUE_CEILING, LARGE_ASSET_CEILING, eok as _eok,
)

DEFAULT_KODATA = ROOT / "backend" / "etl" / "data" / "배포_샘플_KODATA_기업데이터_26-07-06.xlsx"


def _fmt(v) -> str:
    return "-" if v is None or (isinstance(v, float) and np.isnan(v)) else f"{v:.0f}"


def _head(t: str) -> None:
    print(f"\n{'─' * 72}\n{t}\n{'─' * 72}")


def _numeric(yearly: pd.DataFrame, col: str) -> pd.DataFrame:
    """(기업일련번호, year, col) — col을 숫자로 강제(원본이 문자열 dtype일 수 있음)."""
    d = yearly[["기업일련번호", "year", col]].copy()
    d[col] = pd.to_numeric(d[col], errors="coerce")
    return d.dropna(subset=[col]).sort_values(["기업일련번호", "year"])


def _latest_valid(yearly: pd.DataFrame, col: str) -> pd.Series:
    return _numeric(yearly, col).groupby("기업일련번호")[col].last()


def _recent3_mean(yearly: pd.DataFrame, col: str) -> pd.Series:
    """기업별 최근 3개년(가용) 평균 — 법정 매출 기준이 3년평균."""
    return _numeric(yearly, col).groupby("기업일련번호")[col].apply(lambda s: s.tail(3).mean())


def main() -> None:
    ap = argparse.ArgumentParser(description="기업규모 결측·정합성 EDA (읽기 전용)")
    ap.add_argument("--kodata", default=str(DEFAULT_KODATA), help="KODATA 기업데이터 xlsx 경로")
    args = ap.parse_args()

    path = Path(args.kodata)
    if not path.exists():
        sys.exit(f"❌ 파일 없음: {path}")

    static_df, yearly_df = parse_company_info(str(path))
    n = len(static_df)
    print("=" * 72)
    print(f"기업규모 결측·정합성 EDA — {path.name}  (기업 {n}개)")
    print("=" * 72)

    df = pd.DataFrame({
        "size": static_df.set_index("기업일련번호")["기업규모(대/중/소)"],
        "ksic": static_df.set_index("기업일련번호")["KSIC코드(11차)"],
        "emp": _latest_valid(yearly_df, "종업원수"),
        "rev3y": _recent3_mean(yearly_df, "매출액"),
        "asset": _latest_valid(yearly_df, "자산총계"),
    })

    # ── 1. 결측률 ────────────────────────────────────────────────
    _head("[1] 기업규모 결측률 — 미상(전체fallback) 대상 규모")
    miss = int(df["size"].isna().sum())
    print(f"  기업규모 결측: {miss}/{n} ({100 * miss / n:.1f}%) → 유추 안 함, 미상 유지")
    print("\n  값 분포:")
    print(df["size"].value_counts(dropna=False).to_string().replace("\n", "\n    "))

    # ── 2. 규모별 분포 ───────────────────────────────────────────
    _head("[2] 규모별 종업원수 · 매출(3년평균, 천원) — 신고 분포 맥락")
    present = df[df["size"].notna()].copy()
    present["size"] = pd.Categorical(present["size"], categories=SIZE_ORDER, ordered=True)
    for label in SIZE_ORDER:
        g = present[present["size"] == label]
        if g.empty:
            print(f"  {label:5s}: (표본 없음)")
            continue
        e = g["emp"].describe()
        r = g["rev3y"]
        print(f"  {label:5s} n={len(g):>3}  "
              f"종업원 [{_fmt(e.get('min'))}~{_fmt(e.get('max'))}, 중앙 {_fmt(e.get('50%'))}]  "
              f"매출3y [{_eok(r.min())}~{_eok(r.max())}, 중앙 {_eok(r.median())}]")

    # ── 3. 정합성 경고 (법 근거만) ───────────────────────────────
    _head("[3] 정합성 경고 — 법으로 확정된 모순만 (임계값 지어내지 않음)")
    issues = chk.find_inconsistencies(df)
    if issues:
        for it in issues:
            print(f"  ⚠️ {it['company_id']} · {it['rule']}: {it['detail']}")
        print(f"\n  → {len(issues)}건. 값은 안 고침(제공값 유지). ETL이 이 판정을 company별 "
              "dataQuality.inconsistencies로 넘기고, 대시보드 품질경고 + 스코어카드 배지로 노출.")
    else:
        print("  ✓ 법정 기준 위반(소상공인 종업원 초과 / 중소 졸업선 초과) 없음")

    _head("[요약] 판정 상수 (법 근거 — 코드/ETL 공통)")
    print(f"  소상공인 종업원 상한 : 제조·광업·건설·운수 {SANGONGIN_EMP_10} / 기타 {SANGONGIN_EMP_ETC} (미만)")
    print(f"  중소기업 매출 졸업선 : 3년평균 {_eok(SME_REVENUE_CEILING)} 초과")
    print(f"  대기업 자산 편입선   : {_eok(LARGE_ASSET_CEILING)} 이상")


if __name__ == "__main__":
    main()

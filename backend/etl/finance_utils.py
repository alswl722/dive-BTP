"""공통 재무 계산 방어 모듈 (팀 공유).

재무 3축(성장성·수익성·안정성)과 기술력 축(팀원 B)에서 공용으로 쓰는
견고한 계산 유틸. 모든 함수는 **스칼라와 pandas.Series 양쪽**을 받고,
결측(NaN)·0·음수·inf를 안전하게 NaN으로 처리한다.

설계 원칙
- 절대 예외를 던지지 않는다(불량 입력 → NaN). 대규모 배치 계산 중 한 기업
  때문에 파이프라인이 멈추면 안 됨.
- 임계값·정규화는 여기서 하지 않는다(스코어링은 다음 단계).

함수
- safe_cagr(start, end, years)  : 연평균성장률. 음수·0 밑 방어(이익류 CAGR 금지).
- safe_ratio(numerator, denom)  : 비율. 분모 0/결측/음수 방어.
- winsorize(series, lower, upper): 분위수 극단값 clip.
- slope(values)                 : 연도 시퀀스 선형회귀 기울기(추세).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

__all__ = ["safe_cagr", "safe_ratio", "winsorize", "slope"]


# --- 내부 헬퍼 --------------------------------------------------------------
def _is_seriesish(x) -> bool:
    """Series/배열/리스트/튜플이면 True (벡터 경로 판단용)."""
    return isinstance(x, (pd.Series, np.ndarray, list, tuple))


def _num(x):
    """숫자로 강제. 비유한값(inf/-inf)과 파싱불가는 NaN으로.

    - Series/배열/리스트 → 숫자 Series(원 인덱스 보존)
    - 스칼라           → float 또는 np.nan
    """
    if isinstance(x, pd.Series):
        s = pd.to_numeric(x, errors="coerce")
        return s.replace([np.inf, -np.inf], np.nan)
    if isinstance(x, (np.ndarray, list, tuple)):
        s = pd.to_numeric(pd.Series(x), errors="coerce")
        return s.replace([np.inf, -np.inf], np.nan)
    # 스칼라
    try:
        v = float(x)
    except (TypeError, ValueError):
        return np.nan
    return v if np.isfinite(v) else np.nan


# --- 공개 함수 --------------------------------------------------------------
def safe_cagr(start, end, years):
    """연평균성장률(CAGR) = (end/start)**(1/years) - 1.

    NaN 반환 조건 (음수 밑의 거듭제곱근 깨짐·발산 방지):
    - start <= 0  (매출 시작값 0/음수 → 성장률 정의 불가)
    - end   <= 0  (이익류처럼 음수면 CAGR 금지 → 방향·비율 지표로만)
    - years <= 0
    - start/end/years 중 결측

    스칼라·Series 모두 지원. 하나라도 Series면 Series 반환.

    예) safe_cagr(0, 200, 4) → NaN,  safe_cagr(-5, 200, 4) → NaN,
        safe_cagr(100, -5, 4) → NaN, safe_cagr(100, 200, 4) → 0.189...
    """
    s, e, y = _num(start), _num(end), _num(years)
    vector = _is_seriesish(start) or _is_seriesish(end) or _is_seriesish(years)

    with np.errstate(all="ignore"):
        if vector:
            base = e / s
            out = base ** (1.0 / y) - 1.0
            # NaN 비교는 False → invalid로 자연 처리됨
            invalid = ~((s > 0) & (e > 0) & (y > 0))
            out = pd.Series(out) if not isinstance(out, pd.Series) else out
            return out.where(~invalid, np.nan)
        # 스칼라 경로: NaN이면 아래 비교가 모두 False → NaN 반환
        if not (s > 0 and e > 0 and y > 0):
            return np.nan
        return (e / s) ** (1.0 / y) - 1.0


def safe_ratio(numerator, denominator):
    """비율 = numerator / denominator.

    NaN 반환 조건:
    - denominator == 0  (분모 0 방어)
    - denominator <  0  (부채비율·이익률에서 음수 분모는 해석 불가 → 자본총계≤0
      같은 자본잠식 케이스를 여기서 자동 차단)
    - numerator 또는 denominator 결측
    - 결과가 inf (방어적으로 한 번 더 제거)

    부채비율(부채/자본)·이익률(이익/매출)·R&D비율 등 공용.
    스칼라·Series 모두 지원.

    예) safe_ratio(10, 0) → NaN, safe_ratio(10, -2) → NaN, safe_ratio(10, 2) → 5.0
    """
    n, d = _num(numerator), _num(denominator)
    vector = _is_seriesish(numerator) or _is_seriesish(denominator)

    with np.errstate(all="ignore"):
        if vector:
            out = n / d
            out = pd.Series(out) if not isinstance(out, pd.Series) else out
            invalid = ~(d > 0) | pd.isna(n)  # d<=0 / d결측 / n결측
            out = out.where(~invalid, np.nan)
            return out.replace([np.inf, -np.inf], np.nan)
        # 스칼라
        if pd.isna(n) or not (d > 0):  # d가 NaN이면 d>0이 False
            return np.nan
        r = n / d
        return r if np.isfinite(r) else np.nan


def winsorize(series, lower: float = 0.05, upper: float = 0.95):
    """분위수 기준 극단값 clip (기본 5%~95%).

    비율 컬럼(영업이익률 등)의 이상치가 기울기·평균 계산을 왜곡하는 걸 방지.
    보통 '한 연도의 값을 기업들 사이(cross-sectional)'로 넘겨 호출한다.

    - 입력은 Series(또는 배열/리스트 → Series 변환). 인덱스 보존.
    - 유효값 2개 미만이거나 전부 NaN이면 clip 없이 그대로 반환(자를 근거 없음).
    - NaN은 그대로 유지(clip 대상 아님).
    """
    s = _num(series)
    if not isinstance(s, pd.Series):
        s = pd.Series(s)
    if s.notna().sum() < 2:
        return s
    lo = s.quantile(lower)
    hi = s.quantile(upper)
    if pd.isna(lo) or pd.isna(hi):
        return s
    return s.clip(lower=lo, upper=hi)


def slope(values, x=None):
    """연도별 값 시퀀스의 선형회귀 기울기(추세). 1차 최소제곱.

    - values: 시간순 값 시퀀스(리스트/배열/Series).
    - x: 각 값의 실제 x좌표(예: 연도 [2020, 2022, 2024]). 생략하면 위치
      인덱스(0,1,2…) 등간격 가정. **연도 컬럼이 띄엄띄엄이면 반드시 x를
      넘겨야** 간격 왜곡이 없다(위치 기반은 2020,2022,2024를 1년 간격으로
      취급해 기울기를 2배 과대평가).
    - 결측은 위치(또는 x)를 유지한 채 제외: [10, NaN, 30] → 점 (0,10),(2,30) → 10.
    - 결측 제거 후 유효점 2개 미만이거나 x 길이 불일치면 NaN.
    - 부호: 양수면 상승 추세, 음수면 하락 추세.
    """
    s = _num(values)
    if not isinstance(s, pd.Series):
        s = pd.Series(s)
    y = s.to_numpy(dtype="float64")
    if x is None:
        xs = np.arange(len(y), dtype="float64")
    else:
        xs = np.asarray(pd.to_numeric(pd.Series(list(x)), errors="coerce"), dtype="float64")
        if len(xs) != len(y) or np.isnan(xs).any():
            return np.nan  # x 좌표 불량 → 회귀 불가
    mask = ~np.isnan(y)
    if mask.sum() < 2:
        return np.nan
    with np.errstate(all="ignore"):
        return float(np.polyfit(xs[mask], y[mask], 1)[0])


# --- 방어 자체 테스트 -------------------------------------------------------
if __name__ == "__main__":
    print("=" * 60)
    print("finance_utils 방어 자체 테스트")
    print("=" * 60)

    print("\n[safe_cagr] 정상/방어")
    cases = [
        ("정상 (100→200, 4y)", safe_cagr(100, 200, 4)),
        ("start=0 → NaN", safe_cagr(0, 200, 4)),
        ("start<0 → NaN", safe_cagr(-5, 200, 4)),
        ("end<0(이익류) → NaN", safe_cagr(100, -5, 4)),
        ("years=0 → NaN", safe_cagr(100, 200, 0)),
        ("start=NaN → NaN", safe_cagr(np.nan, 200, 4)),
    ]
    for name, val in cases:
        print(f"  {name:24s}: {val}")
    print("  Series 혼합:")
    print(safe_cagr(pd.Series([100, 0, -5, np.nan]),
                    pd.Series([200, 200, 200, 200]), 4).to_list())

    print("\n[safe_ratio] 정상/방어")
    cases = [
        ("정상 (10/2)", safe_ratio(10, 2)),
        ("분모=0 → NaN", safe_ratio(10, 0)),
        ("분모<0(자본잠식) → NaN", safe_ratio(10, -2)),
        ("분자=NaN → NaN", safe_ratio(np.nan, 2)),
        ("분모=NaN → NaN", safe_ratio(10, np.nan)),
    ]
    for name, val in cases:
        print(f"  {name:24s}: {val}")
    print("  Series 혼합:")
    print(safe_ratio(pd.Series([10, 10, 10, 10]),
                     pd.Series([2, 0, -2, np.nan])).to_list())

    print("\n[winsorize] 극단값 clip (0.05~0.95)")
    s = pd.Series([1, 2, 3, 4, 5, 6, 7, 8, 9, 1000])
    print("  원본 max=1000 →", "clip 후 max=", round(winsorize(s).max(), 2))
    print("  전부 NaN → 그대로:", winsorize(pd.Series([np.nan, np.nan])).to_list())
    print("  유효 1개 → 그대로:", winsorize(pd.Series([np.nan, 5.0])).to_list())

    print("\n[slope] 추세")
    cases = [
        ("[1,2,3,4] → 1.0", slope([1, 2, 3, 4])),
        ("[4,3,2,1] → -1.0", slope([4, 3, 2, 1])),
        ("[10,NaN,30] → 10.0", slope([10, np.nan, 30])),
        ("[NaN,NaN] → NaN", slope([np.nan, np.nan])),
        ("유효 1개 → NaN", slope([np.nan, 5, np.nan])),
        ("연도 x축(2020,2022,2024) → 10.0", slope([100, 120, 140], x=[2020, 2022, 2024])),
        ("x 길이 불일치 → NaN", slope([1, 2, 3], x=[2020, 2021])),
    ]
    for name, val in cases:
        print(f"  {name:24s}: {val}")

    print("\n✅ 모든 방어 케이스에서 NaN/기대값 확인")

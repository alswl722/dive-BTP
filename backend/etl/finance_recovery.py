"""재무 파생 결측 복원 — 회계 항등식으로 '계산'해서 채운다 (추정 아님).

방침:
    기업규모(#1)는 '유추=추정'이라 채우면 오도 위험이 커서 안 채웠지만, 재무 항등식은
    exact math라 나머지 두 값이 있으면 세 번째는 유일하게 결정된다 → 채워도 안전.
    (샘플에서 자산=부채+자본 최대오차 0, 영업이익률=영업이익÷매출 최대오차 0.00%p 실증)

복원 항등식 (셋 중 둘 있으면 나머지 하나):
    (A) 자산총계 = 부채총계 + 자본총계
    (B) 영업이익률(%) = 영업이익손실 ÷ 매출액 × 100

'설립 전 결측'은 자동 안전: 복원은 나머지 2개가 있을 때만 발동하므로, 전부 빈
설립-전 행은 손대지 않는다(0으로 채우지 않음 → 성장률 왜곡 없음).

    ⚠️ 매출·영업이익·자산·부채·자본 단위 = 천원. 영업이익률은 %(무단위). 항등식은
       모두 단위 정합적이라 스케일 변환 불필요.

SSOT: 이 모듈을 ETL(run_etl)과 EDA(scripts/eda_finance_recovery.py)가 공유한다.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

# 항등식이 다루는 6개 컬럼 (parse_company_info yearly_long_df 기준 원본 한글명)
ASSET, DEBT, EQUITY = "자산총계", "부채총계", "자본총계"
OPPROFIT, REVENUE, OPMARGIN = "영업이익손실", "매출액", "영업이익률"
COLS = [ASSET, DEBT, EQUITY, OPPROFIT, REVENUE, OPMARGIN]

# 복원값이 항등식에서 나왔음을 나타내는 감사 규칙 키
RULES = [f"{c}_복원" for c in (ASSET, DEBT, EQUITY, OPMARGIN, OPPROFIT, REVENUE)]


def _num(df: pd.DataFrame, c: str) -> pd.Series:
    """숫자 강제(원본이 문자열 dtype일 수 있음). 없는 컬럼은 전부 NaN."""
    if c not in df.columns:
        return pd.Series(np.nan, index=df.index)
    return pd.to_numeric(df[c], errors="coerce")


def recover_financial_identities(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, int]]:
    """yearly long df의 6개 재무컬럼을 항등식으로 복원. (df_채워짐, audit) 반환.

    - 대상 컬럼을 숫자로 강제(apply_config가 어차피 재강제하므로 무해)
    - target이 결측이고 소스 2개가 존재할 때만 채운다(설립-전 전멸 행은 자동 스킵)
    - 나눗셈 복원은 분모≠0 조건까지 확인
    audit = {규칙: 복원건수}
    """
    df = df.copy()
    for c in COLS:
        if c in df.columns:
            df[c] = _num(df, c)

    a, d, e = _num(df, ASSET), _num(df, DEBT), _num(df, EQUITY)
    op, rev, mgn = _num(df, OPPROFIT), _num(df, REVENUE), _num(df, OPMARGIN)
    audit: dict[str, int] = {}

    def fill(col: str, mask: pd.Series, values: pd.Series, rule: str) -> None:
        mask = mask.fillna(False)
        n = int(mask.sum())
        if n and col in df.columns:
            df.loc[mask, col] = values[mask]
            audit[rule] = n

    # (A) 자산 = 부채 + 자본
    fill(ASSET,  a.isna() & d.notna() & e.notna(), d + e,          f"{ASSET}_복원")
    fill(DEBT,   d.isna() & a.notna() & e.notna(), a - e,          f"{DEBT}_복원")
    fill(EQUITY, e.isna() & a.notna() & d.notna(), a - d,          f"{EQUITY}_복원")

    # (B) 영업이익률 = 영업이익 ÷ 매출 × 100  (나눗셈 복원은 분모≠0)
    fill(OPMARGIN, mgn.isna() & op.notna() & rev.notna() & (rev != 0),
         op / rev * 100, f"{OPMARGIN}_복원")
    fill(OPPROFIT, op.isna() & mgn.notna() & rev.notna(),
         mgn / 100 * rev, f"{OPPROFIT}_복원")
    fill(REVENUE, rev.isna() & op.notna() & mgn.notna() & (mgn != 0),
         op / (mgn / 100), f"{REVENUE}_복원")

    return df, audit


def identity_violations(df: pd.DataFrame, atol_asset: float = 1.0,
                        rtol_margin: float = 0.5) -> dict[str, int]:
    """값이 모두 있는 행에서 항등식이 깨진 건수 — 데이터 품질 신호(복원과 별개).

    atol_asset: 자산=부채+자본 허용 절대오차(천원). rtol_margin: 영업이익률 허용오차(%p).
    """
    a, d, e = _num(df, ASSET), _num(df, DEBT), _num(df, EQUITY)
    op, rev, mgn = _num(df, OPPROFIT), _num(df, REVENUE), _num(df, OPMARGIN)
    out: dict[str, int] = {}

    m1 = a.notna() & d.notna() & e.notna()
    if m1.any():
        out["자산≠부채+자본"] = int((m1 & ((a - (d + e)).abs() > atol_asset)).sum())

    m2 = op.notna() & rev.notna() & mgn.notna() & (rev != 0)
    if m2.any():
        out["영업이익률≠영업이익/매출"] = int((m2 & ((mgn - op / rev * 100).abs() > rtol_margin)).sum())
    return out

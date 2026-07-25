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

# 신고 영업이익률 ↔ 손익(영업이익÷매출) 불일치 허용오차(%p). 반올림(본선 실측 ~1.5%p)은
# 정상으로 넘기고, 그 이상만 원본 오류로 본다. 본선 실측상 반올림 최대 ~1.5%p, gross 오류는
# 474%p+라 3%p면 두 부류를 깨끗이 가른다. (튜닝값이라 추후 config 이관 여지 있으나 지금은 단일
# 상수로 SSOT 유지 — EDA·배지가 이 값을 공유.)
MARGIN_INCONSISTENCY_TOLERANCE_PP = 3.0


def _scalar_num(v) -> float | None:
    """스칼라 → float 또는 None(결측/변환불가). check_margin_consistency용."""
    x = pd.to_numeric(v, errors="coerce")
    return None if pd.isna(x) else float(x)


def check_margin_consistency(op_by_year: dict, rev_by_year: dict, margin_by_year: dict,
                             tol_pp: float = MARGIN_INCONSISTENCY_TOLERANCE_PP) -> list[dict]:
    """신고 영업이익률이 손익(영업이익÷매출)과 tol_pp 초과로 어긋나는 연도를 찾는다.

    값은 고치지 않고 '사실만' 반환한다(추측/변조 금지 원칙). 판정식은 identity_violations
    (op/rev*100 vs 신고, rev≠0 가드)과 동일 — SSOT.

    입력: {연도: 값} dict 3개(영업이익손실/매출액/영업이익률). 위반 연도들을 모아
    기업당 최대 1개 항목 [{"rule","detail"}] 반환(위반 없으면 []).
    """
    bad = []  # (year, 신고, 계산)
    for y in sorted(margin_by_year):
        op = _scalar_num(op_by_year.get(y))
        rev = _scalar_num(rev_by_year.get(y))
        mgn = _scalar_num(margin_by_year.get(y))
        if op is None or rev is None or mgn is None or rev == 0:
            continue
        computed = op / rev * 100
        if abs(mgn - computed) > tol_pp:
            bad.append((y, mgn, computed))
    if not bad:
        return []
    parts = "; ".join(f"{y}년 신고 {m:.0f}% vs 손익 {c:.0f}%" for y, m, c in bad)
    return [{
        "rule": "영업이익률_손익불일치",
        "detail": f"신고 영업이익률이 손익 계산과 불일치 — {parts}",
    }]


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
    # ⚠️ OPPROFIT은 곱셈이라 수학적으로는 rev=0 가드가 불필요하지만, 매출=0인데 영업이익률만
    #    값이 있는 원본 모순(0/0 불정형·신고 오류)에서 mgn/100*0=0으로 조용히 정규화되면
    #    이상 신호가 사라져 identity_violations도 못 잡는다. rev != 0로 스킵해 NaN 유지 →
    #    아래 identity_violations의 "매출0_영업이익률존재" rule이 원본 모순으로 잡음.
    fill(OPMARGIN, mgn.isna() & op.notna() & rev.notna() & (rev != 0),
         op / rev * 100, f"{OPMARGIN}_복원")
    fill(OPPROFIT, op.isna() & mgn.notna() & rev.notna() & (rev != 0),
         mgn / 100 * rev, f"{OPPROFIT}_복원")
    # OPPROFIT 복원과 대칭 방어: op=0인데 mgn≠0인 원본 모순(0÷0 불정형·신고 오류)에서
    # 0÷(mgn/100)=0으로 조용히 채우면 위험 신호가 사라진다. op != 0로 스킵해 NaN 유지 →
    # identity_violations의 "영업이익0_영업이익률존재" rule이 원본 모순으로 잡는다.
    fill(REVENUE, rev.isna() & op.notna() & mgn.notna() & (mgn != 0) & (op != 0),
         op / (mgn / 100), f"{REVENUE}_복원")

    return df, audit


def identity_violations(df: pd.DataFrame, atol_asset: float = 1.0,
                        rtol_margin: float = MARGIN_INCONSISTENCY_TOLERANCE_PP) -> dict[str, int]:
    """값이 모두 있는 행에서 항등식이 깨진 건수 — 데이터 품질 신호(복원과 별개).

    atol_asset: 자산=부채+자본 허용 절대오차(천원). rtol_margin: 영업이익률 허용오차(%p).
    영업이익률 허용오차는 배지 판정(check_margin_consistency)과 같은 상수를 기본값으로 써서
    EDA·스코어카드가 동일 임계값을 공유한다(반올림은 위반으로 세지 않음).
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

    # 매출=0인데 영업이익률 값 존재 — 원본 데이터 모순 (0/0 불정형 or 신고 오류).
    # OPPROFIT 복원에서 rev != 0 가드로 스킵된 케이스가 여기로 잡힘 → UI/EDA 이상 신호.
    m3 = rev.notna() & mgn.notna() & (rev == 0)
    if m3.any():
        out["매출0_영업이익률존재"] = int(m3.sum())

    # 영업이익=0인데 영업이익률 값 존재(≠0) — 위와 대칭인 원본 모순.
    # REVENUE 복원에서 op != 0 가드로 스킵된 케이스가 여기로 잡힘.
    m4 = op.notna() & mgn.notna() & (op == 0) & (mgn != 0)
    if m4.any():
        out["영업이익0_영업이익률존재"] = int(m4.sum())
    return out

"""선정결과 결측 추론 — 축9·반복선정 랭킹·축8의 '모집단'을 정하는 민감한 규칙.

배경:
    코드 곳곳이 selection_result='지원대상'만 필터한다(중복탐지·랭킹·정합성 판정 대상).
    따라서 선정결과 결측을 '지원대상/탈락' 중 무엇으로 채우느냐가 곧 "누가 심사·집계
    대상이냐"를 정한다 → 보수적으로.

EDA 교정 (정책 가정 vs 실데이터):
    정책 원안은 "뒤 칼럼(지원금) 있으면 지원대상, '-'면 탈락"이었으나, 지원금은 신뢰
    불가하다 — 탈락 행도 지원금을 갖는 경우가 있다. 실제 신뢰 신호는 시작일/종료일:
      · 지원대상 → 시작일/종료일에 실제 날짜(사업 집행)
      · 탈락    → 시작일/종료일이 '-'(BTP의 '미집행' 마커) 또는 결측
    '-'는 명시적 미집행 마커라 강한 탈락 신호.

    실데이터 오염 케이스(2024_기업지원목록 4건, 기업일련번호 124/1594/1640/1110):
    선정결과 칸에 종료예정일로 보이는 날짜값('2024-12-31')이 잘못 입력됨. 지원금·
    시작일·종료일이 전부 결측이라 탈락 확정 신호('-')도 없음 → 규칙 원칙대로 미상
    유지. 날짜 타입은 COL_RESULT 한정으로 결측 취급(_result_missing)한다.

추론 규칙 (선정결과 결측일 때만):
    (1) 시작일 또는 종료일에 실제 날짜  → '지원대상'
    (2) 시작일 또는 종료일이 '-'        → '탈락'
    (3) 아무 신호 없음(전부 결측)       → 미상 유지(채우지 않음) — 모집단 오염 방지

    ※ 지원금은 판정에 쓰지 않는다(탈락도 가질 수 있어 오분류 유발).
    ※ '포기'는 별도 값이라 추론 대상 아님(신호 없으면 미상으로 남음).

SSOT: 이 모듈을 ETL(run_etl)과 EDA(scripts/eda_selection_result.py)가 공유한다.
"""

from __future__ import annotations

import datetime

import pandas as pd

SELECTED = "지원대상"
REJECTED = "탈락"

COL_RESULT = "선정결과"
COL_START = "시작일"
COL_END = "종료일"


def _missing(v) -> bool:
    return pd.isna(v) or str(v).strip() in ("", "nan", "NaT")


def _result_missing(v) -> bool:
    """COL_RESULT 전용 결측 판정. 날짜 타입 오염(예: 종료예정일이 잘못 입력됨)도 결측 취급."""
    if isinstance(v, (pd.Timestamp, datetime.date)):
        return True
    return _missing(v)


def _is_dash(v) -> bool:
    return not pd.isna(v) and str(v).strip() == "-"


def _real(v) -> bool:
    """실제 값(결측도 '-'도 아님)."""
    return not _missing(v) and not _is_dash(v)


def infer_one(result, start, end) -> tuple[object, str | None]:
    """단일 레코드 추론 → (선정결과, 추론사유). 사유 None = 원본 유지(추론 안 함).

    선정결과가 이미 있으면 그대로. 결측이면(날짜 타입 오염 포함) 시작일/종료일 신호로 판정.
    """
    if not _result_missing(result):
        return result, None  # 원본 유지
    if _real(start) or _real(end):
        return SELECTED, "시작일/종료일 실제 날짜"
    if _is_dash(start) or _is_dash(end):
        return REJECTED, "시작일/종료일 '-'"
    return pd.NA, None  # 신호 없음 → 미상 유지(오염값도 결측으로 정규화)


def infer_selection_results(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, int]]:
    """선정결과 결측 행을 추론으로 채운다. (df, audit) 반환.

    audit = {지원대상_추론, 탈락_추론, 미상_유지} — 모집단 영향 파악용.
    """
    df = df.copy()
    if COL_RESULT not in df.columns:
        return df, {}

    audit = {"지원대상_추론": 0, "탈락_추론": 0, "미상_유지": 0}
    for idx in df.index[df[COL_RESULT].apply(_result_missing)]:
        start = df.at[idx, COL_START] if COL_START in df.columns else None
        end = df.at[idx, COL_END] if COL_END in df.columns else None
        new_result, reason = infer_one(df.at[idx, COL_RESULT], start, end)
        if reason is None:
            audit["미상_유지"] += 1
            df.at[idx, COL_RESULT] = new_result  # 오염값(날짜 등)도 결측으로 정규화
        else:
            df.at[idx, COL_RESULT] = new_result
            audit["지원대상_추론" if new_result == SELECTED else "탈락_추론"] += 1
    return df, {k: v for k, v in audit.items() if v}

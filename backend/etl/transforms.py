"""ETL 공용 변환 헬퍼.

원본 엑셀의 값 표기를 DB 타입으로 안전하게 변환한다. 전부 결측/이상값을
예외 없이 None으로 반환한다(배치 적재 중 한 셀 때문에 전체가 멈추면 안 됨).

함수
- parse_date_yyyymmdd(v)  : "20100202" 같은 문자열/숫자 → date. 공백/결측 → None.
- yn_to_bool(v)           : 'Y'/'N', '유'/'무', '여'/'부' 등 → bool. 결측 → None.
- to_int(v) / to_float(v) : 결측/파싱불가 → None.
- blank_to_none(v)        : 공백 문자열(" ")을 None으로 통일 (원본에 자주 등장).
"""

from __future__ import annotations

import datetime as _dt
import math

import pandas as pd

TRUE_TOKENS = {"Y", "유", "여", "1", "TRUE", "T"}
FALSE_TOKENS = {"N", "무", "부", "0", "FALSE", "F"}


def blank_to_none(v):
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    if isinstance(v, str) and v.strip() == "":
        return None
    return v


def parse_date_yyyymmdd(v):
    """'YYYYMMDD' 문자열/정수 → datetime.date. 결측/공백/8자리 아님 → None."""
    v = blank_to_none(v)
    if v is None:
        return None
    if isinstance(v, (_dt.date, _dt.datetime, pd.Timestamp)):
        return pd.Timestamp(v).date()
    s = str(v).strip()
    if s.endswith(".0"):
        s = s[:-2]
    if len(s) != 8 or not s.isdigit():
        return None
    try:
        return _dt.datetime.strptime(s, "%Y%m%d").date()
    except ValueError:
        return None


def yn_to_bool(v):
    v = blank_to_none(v)
    if v is None:
        return None
    s = str(v).strip().upper()
    if s in TRUE_TOKENS:
        return True
    if s in FALSE_TOKENS:
        return False
    return None


def to_int(v):
    v = blank_to_none(v)
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return int(round(f))


def to_float(v):
    v = blank_to_none(v)
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return f


def to_str(v):
    v = blank_to_none(v)
    if v is None:
        return None
    return str(v).strip()

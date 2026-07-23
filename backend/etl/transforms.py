"""ETL 공용 변환 헬퍼.

원본 엑셀의 값 표기를 DB 타입으로 안전하게 변환한다. 전부 결측/이상값을
예외 없이 None으로 반환한다(배치 적재 중 한 셀 때문에 전체가 멈추면 안 됨).

함수
- parse_date_yyyymmdd(v)  : "20100202" 같은 문자열/숫자 → date. 공백/결측 → None.
- yn_to_bool(v)           : 'Y'/'N', '유'/'무', '여'/'부' 등 → bool. 결측 → None.
- to_int(v) / to_float(v) : 결측/파싱불가 → None.
- blank_to_none(v)        : 공백 문자열(" ")을 None으로 통일 (원본에 자주 등장).
- normalize_ministry(v)   : 부처 약칭/오탈자 → 정식명칭(config/ministry_map.yaml).
                            결측 → "미상". 매핑에 없는 값은 원본 유지(임의 추정 금지).
"""

from __future__ import annotations

import datetime as _dt
import math
from functools import lru_cache
from pathlib import Path

import pandas as pd
import yaml

CONFIG_DIR = Path(__file__).resolve().parent / "config"

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


@lru_cache(maxsize=1)
def _ministry_map() -> tuple[dict[str, str], str]:
    with open(CONFIG_DIR / "ministry_map.yaml", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    alias = {
        str(k).strip().replace(" ", ""): v
        for k, v in (cfg.get("alias_to_canonical") or {}).items()
    }
    return alias, cfg.get("missing_label", "미상")


def normalize_ministry(v):
    """부처명 약칭/오탈자 → 정식명칭. 결측은 missing_label(기본 "미상")로 통일.

    config/ministry_map.yaml에 없는 값은 원본을 그대로 보존한다 —
    임의로 새 별칭을 추정해 합치지 않는다(도메인_출처=미상과 동일 원칙).
    """
    alias, missing_label = _ministry_map()
    v = blank_to_none(v)
    if v is None:
        return missing_label
    key = str(v).strip().replace(" ", "")
    return alias.get(key, str(v).strip())

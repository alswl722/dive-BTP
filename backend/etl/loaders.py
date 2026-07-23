"""config/*.yaml 기반 제네릭 로더.

파서가 만든 tidy DataFrame(원본 한글 컬럼명)을 yaml의 컬럼 매핑표에 따라
DB 컬럼명으로 리네임 + dtype 캐스팅한 뒤 Postgres 테이블에 적재한다.
"실제 발제 데이터가 샘플과 컬럼명이 다르면 yaml만 고치면 된다"(CLAUDE.md 개발원칙3)를
구현하는 지점 — 컬럼명을 파이썬 코드에 하드코딩하지 않는다.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import yaml
from sqlalchemy.engine import Engine

import transforms as T

CONFIG_DIR = Path(__file__).resolve().parent / "config"

_CASTERS = {
    "int": T.to_int,
    "float": T.to_float,
    "str": T.to_str,
    "date": T.parse_date_yyyymmdd,
    "bool": T.yn_to_bool,
    "ministry": T.normalize_ministry,
}


def load_config(name: str) -> dict:
    with open(CONFIG_DIR / f"{name}.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


def apply_config(df: pd.DataFrame, config: dict) -> pd.DataFrame:
    """config['columns']에 정의된 원본 컬럼만 골라 DB 컬럼명으로 리네임 + dtype 캐스팅."""
    col_map = config["columns"]
    missing = [src for src in col_map if src not in df.columns]
    if missing:
        raise KeyError(
            f"[{config.get('table')}] 원본에 없는 컬럼: {missing}\n"
            f"  → 실제 데이터 컬럼명이 바뀌었다면 config/*.yaml만 수정하면 됨. 실제 컬럼: {list(df.columns)}"
        )

    out = pd.DataFrame()
    for src, spec in col_map.items():
        caster = _CASTERS[spec["dtype"]]
        out[spec["db"]] = df[src].map(caster)
    return out


def write_table(engine: Engine, df: pd.DataFrame, table: str, truncate: bool = True) -> int:
    """TRUNCATE 후 INSERT — 몇 번을 재실행해도 같은 결과(idempotent)."""
    with engine.begin() as conn:
        if truncate:
            conn.exec_driver_sql(f'TRUNCATE TABLE "{table}" CASCADE')
        df.to_sql(table, conn, if_exists="append", index=False, method="multi", chunksize=500)
    return len(df)

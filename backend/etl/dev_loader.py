"""DB 없이 샘플 엑셀 → 정규화 테이블 DataFrame (팀원 개발용).

팀원 C의 Postgres 스키마가 확정되기 전, 각 축 담당자가 sample xlsx로 로직을
먼저 검증할 수 있게 하는 오프라인 로더. run_etl.py와 **완전히 같은 파서·config·
transforms**를 재사용하되, DB에 적재하는 대신 in-memory DataFrame으로 반환한다.
→ 여기서 나오는 DataFrame의 컬럼명·dtype은 DB 테이블과 동일하므로, 로직을
   dev_loader로 개발한 뒤 `--source db`로 바꿔도 코드가 그대로 붙는다.

반환 테이블(키=DB 테이블명):
  companies / company_yearly_metrics / company_certifications /
  patents / ntis_lead_projects / ntis_consigned_projects

사용:
    from dev_loader import load_tables
    tables = load_tables()                 # 샘플 파일 자동 탐색
    patents = tables["patents"]            # DB patents 테이블과 동일 스키마

    python dev_loader.py                    # 스모크 테스트(테이블별 shape 출력)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

# backend/etl 를 import 경로에 (parsers/loaders/transforms 는 __init__ 없는 플랫 스크립트)
_ETL_DIR = Path(__file__).resolve().parent
if str(_ETL_DIR) not in sys.path:
    sys.path.insert(0, str(_ETL_DIR))

import loaders as L  # noqa: E402
import transforms as T  # noqa: E402
from parsers import (  # noqa: E402
    drop_key_only_rows,
    parse_company_info,
    parse_simple_sheet,
)

# 샘플 파일 자동 탐색 후보 디렉토리 (파일명이 팀원마다 조금씩 달라 glob로 찾음)
_SEARCH_DIRS = [
    _ETL_DIR / "data",          # run_etl.py 기본 위치
    _ETL_DIR.parents[1],        # 프로젝트 루트 (현재 샘플이 여기 있음)
    _ETL_DIR.parent,            # backend/
]


def _find(patterns: list[str]) -> Path | None:
    """후보 디렉토리에서 glob 패턴 중 하나라도 맞는 첫 .xlsx 반환."""
    for d in _SEARCH_DIRS:
        if not d.exists():
            continue
        for pat in patterns:
            hits = sorted(d.glob(pat))
            if hits:
                return hits[0]
    return None


def find_sample_files(kodata: str | None = None, btp: str | None = None) -> tuple[Path, Path]:
    """(KODATA, 부산TP) 엑셀 경로. 인자로 직접 주거나 자동 탐색."""
    ko = Path(kodata) if kodata else _find(["*KODATA*.xlsx", "*기업데이터*.xlsx"])
    bt = Path(btp) if btp else _find(["*TP*.xlsx", "*사업기업목록*.xlsx"])
    if ko is None or bt is None:
        raise SystemExit(
            "샘플 엑셀을 찾지 못함. --kodata / --btp 로 직접 지정하세요.\n"
            f"  탐색한 위치: {[str(d) for d in _SEARCH_DIRS]}"
        )
    return ko, bt


def load_tables(kodata: str | None = None, btp: str | None = None) -> dict[str, pd.DataFrame]:
    """샘플 엑셀 → DB 스키마와 동일한 DataFrame dict."""
    ko_path, _btp_path = find_sample_files(kodata, btp)
    out: dict[str, pd.DataFrame] = {}

    # --- 기업정보 시트: companies / yearly_metrics / certifications ---
    static_df, yearly_df = parse_company_info(str(ko_path))

    out["companies"] = L.apply_config(static_df, L.load_config("companies"))
    out["company_yearly_metrics"] = L.apply_config(yearly_df, L.load_config("company_yearly_metrics"))

    cert_cfg = L.load_config("company_certifications")
    cert_rows = [
        {
            "company_id": T.to_int(row["기업일련번호"]),
            "cert_type": cert,
            "has_cert": T.yn_to_bool(row[cert]),
        }
        for cert in cert_cfg["cert_columns"]
        for _, row in static_df[["기업일련번호", cert]].iterrows()
    ]
    out["company_certifications"] = pd.DataFrame(cert_rows)

    # --- 특허 원장 ---
    pat_cfg = L.load_config("patents")
    pat_df = parse_simple_sheet(str(ko_path), pat_cfg["sheet"], pat_cfg["header_row"])
    out["patents"] = L.apply_config(pat_df, pat_cfg)

    # --- NTIS 주관/위탁 ---
    for cfg_name, table in [("ntis_lead", "ntis_lead_projects"),
                            ("ntis_consigned", "ntis_consigned_projects")]:
        cfg = L.load_config(cfg_name)
        df = parse_simple_sheet(str(ko_path), cfg["sheet"], cfg["header_row"])
        if cfg.get("drop_empty_except_key"):
            df = drop_key_only_rows(df, cfg["key"])
        out[table] = L.apply_config(df, cfg)

    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="샘플 엑셀 → 정규화 DataFrame (스모크 테스트)")
    ap.add_argument("--kodata")
    ap.add_argument("--btp")
    args = ap.parse_args()

    ko, bt = find_sample_files(args.kodata, args.btp)
    print(f"[샘플] KODATA={ko.name}\n       BTP={bt.name}\n")

    tables = load_tables(args.kodata, args.btp)
    print("로드된 테이블 (DB 스키마와 동일 컬럼):")
    for name, df in tables.items():
        print(f"  {name:28s} shape={str(df.shape):>10}  cols={list(df.columns)[:4]}...")


if __name__ == "__main__":
    main()

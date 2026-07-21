"""config/*.yaml 컬럼 매핑 vs 실제 xlsx 시트 헤더 — 적재 전 사전 진단.

check_data_quality.py는 "DB 적재 후" 결측률을 보지만, 이 스크립트는 "적재 전"에
config/*.yaml이 기대하는 컬럼명이 실제 엑셀 시트에 있는지 확인한다. run_etl.py는
매핑 안 된 컬럼을 KeyError로 실행 중에야 터뜨리는데(loaders.apply_config), 이 스크립트는
그 전에 전체 파일을 훑어 한 번에 보여준다.

찾아내는 두 방향의 어긋남:
  1. yaml엔 있는데 xlsx엔 없는 컬럼 — 그대로 실행하면 KeyError로 ETL이 죽는다
  2. xlsx엔 있는데 yaml엔 없는 컬럼 — 에러는 안 나지만 조용히 버려진다(매핑 누락)

companies/company_yearly_metrics/company_certifications 3개는 "1. 기업정보" 시트를
parse_company_info()가 wide→long 피벗한 파생 컬럼셋을 매핑하므로(원본 헤더와 1:1 대응
아님) 원본 헤더 대신 파서 실행 결과와 대조한다.

사용법:
    cd backend/etl && python check_schema_drift.py
    python check_schema_drift.py --kodata <path> --btp <path>   # 본선 데이터 지정
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

import loaders as L
from parsers import _clean_label, parse_company_info

DATA_DIR = Path(__file__).resolve().parent / "data"
KODATA_FILE = DATA_DIR / "배포_샘플_KODATA_기업데이터_26-07-06.xlsx"
BTP_FILE = DATA_DIR / "배포_샘플_부산TP__사업기업목록_26-07-06.xlsx"

# (config 이름, xlsx 종류) — tech_domain.yaml은 컬럼 매핑이 아니라 분류 롤업 규칙이라 제외
SIMPLE_SHEET_CONFIGS = [
    ("patents", "kodata"),
    ("ntis_lead", "kodata"),
    ("ntis_consigned", "kodata"),
    ("business_purposes", "kodata"),
    ("support_programs", "btp"),
    ("support_records", "btp"),
]

# run_etl.py가 시트 원본이 아니라 파싱 후 코드로 직접 주입하는 합성 컬럼(예:
# _year_from_sheet_name으로 시트명에서 연도 추출). xlsx에 없는 게 정상이라 오탐 방지로 제외.
SYNTHETIC_COLUMNS = {"year"}
# parse_company_info()가 특수 파싱(wide→long 피벗)하는 3개 — 원본 헤더 대조 불가
COMPANY_INFO_CONFIGS = ["companies", "company_yearly_metrics", "company_certifications"]


def _sheet_headers(xlsx_path: Path, sheet: str, header_row: int) -> list[str]:
    """실제 시트의 헤더 행만 읽어 컬럼명 목록 반환(parse_simple_sheet와 동일 정제)."""
    df = pd.read_excel(xlsx_path, sheet_name=sheet, header=header_row, nrows=0)
    cols = [c for c in df.columns if not str(c).startswith("Unnamed:")]
    return [_clean_label(c) for c in cols]


def _diff_simple(cfg_name: str, xlsx_path: Path) -> bool:
    """yaml columns vs 실제 시트 헤더. 문제 있으면 True(발견됨) 반환."""
    cfg = L.load_config(cfg_name)
    yaml_cols = set(cfg["columns"].keys()) - SYNTHETIC_COLUMNS
    sheets = cfg["sheets"] if "sheets" in cfg else [cfg["sheet"]]

    found_issue = False
    for sheet in sheets:
        try:
            actual_cols = set(_sheet_headers(xlsx_path, sheet, cfg["header_row"]))
        except ValueError as e:
            print(f"  ⚠️  [{cfg_name}] 시트 '{sheet}' 못 찾음 — 시트명 변경? ({e})")
            found_issue = True
            continue

        missing_in_xlsx = yaml_cols - actual_cols  # yaml에 있는데 실제 파일엔 없음
        missing_in_yaml = actual_cols - yaml_cols   # 실제 파일엔 있는데 yaml 매핑 없음

        if missing_in_xlsx:
            found_issue = True
            print(f"  ❌ [{cfg_name}] 시트 '{sheet}': yaml엔 있는데 xlsx엔 없음(ETL 실행 시 KeyError) "
                  f"→ {sorted(missing_in_xlsx)}")
        if missing_in_yaml:
            found_issue = True
            print(f"  ⚠️  [{cfg_name}] 시트 '{sheet}': xlsx엔 있는데 yaml 매핑 없음(조용히 누락됨) "
                  f"→ {sorted(missing_in_yaml)}")
    if not found_issue:
        print(f"  ✅ [{cfg_name}] 일치")
    return found_issue


def _diff_company_info(xlsx_path: Path) -> bool:
    """companies/company_yearly_metrics/company_certifications — 파서 실행 결과와 대조.

    "1. 기업정보" 시트는 wide→long 피벗을 거치므로 원본 헤더가 아니라
    parse_company_info()의 출력 컬럼(static_df/yearly_long_df)을 기준으로 삼는다.
    """
    found_issue = False
    try:
        static_df, yearly_df = parse_company_info(str(xlsx_path))
    except Exception as e:  # noqa: BLE001 — 시트 구조 자체가 깨진 경우도 여기서 잡는다
        print(f"  ❌ [1. 기업정보 시트] 파싱 실패 — 시트 구조가 예상과 다름: {e}")
        return True

    for cfg_name, produced_cols in [
        ("companies", set(static_df.columns)),
        ("company_certifications", set(static_df.columns)),
        ("company_yearly_metrics", set(yearly_df.columns)),
    ]:
        cfg = L.load_config(cfg_name)
        yaml_cols = set(cfg["columns"].keys()) if "columns" in cfg else set(cfg.get("cert_columns", []))
        missing = yaml_cols - produced_cols
        if missing:
            found_issue = True
            print(f"  ❌ [{cfg_name}] yaml엔 있는데 파서 산출물엔 없음(ETL 실행 시 KeyError) "
                  f"→ {sorted(missing)}")
        else:
            print(f"  ✅ [{cfg_name}] 일치")
    return found_issue


def main():
    parser = argparse.ArgumentParser(description="config/*.yaml 컬럼 매핑 vs 실제 xlsx 사전 진단")
    parser.add_argument("--kodata", default=str(KODATA_FILE))
    parser.add_argument("--btp", default=str(BTP_FILE))
    args = parser.parse_args()

    paths = {"kodata": Path(args.kodata), "btp": Path(args.btp)}
    for label, p in paths.items():
        if not p.exists():
            raise SystemExit(f"{label} 파일 없음: {p}")

    print("=" * 60)
    print("스키마 진단 — config/*.yaml vs 실제 xlsx")
    print("=" * 60)

    any_issue = False

    print("\n■ 1. 기업정보 시트 (wide→long 피벗, 파서 산출물 기준 대조)")
    any_issue |= _diff_company_info(paths["kodata"])

    print("\n■ 단순 헤더 시트")
    for cfg_name, source in SIMPLE_SHEET_CONFIGS:
        any_issue |= _diff_simple(cfg_name, paths[source])

    print("\n" + "=" * 60)
    if any_issue:
        print("⚠️  어긋남 발견 — ❌는 ETL이 즉시 실패하는 항목, ⚠️는 매핑 누락(조용히 버려짐)")
        print("   대응: config/*.yaml의 컬럼명을 실제 시트 헤더에 맞게 수정 (원칙3 — 코드 수정 불필요)")
    else:
        print("✅ 전체 일치 — config/*.yaml과 실제 xlsx 헤더가 정확히 매핑됨")
    print("=" * 60)


if __name__ == "__main__":
    main()

"""ETL 오케스트레이션 — 원본 엑셀 2개 파일 → PostgreSQL 정규화 스키마.

실행 순서(의존성 순, etl-infra-plan Phase 4):
  1. companies                                (기준 엔티티)
  2. company_yearly_metrics, company_certifications,
     patents, ntis_lead/consigned_projects, company_business_purposes  (companies 종속)
  3. ref_business_types, ref_support_types     (참조 테이블)
  4. support_programs → support_records        (programs가 records의 FK)
  5. industry_code_map                         (support_records.industry_code_raw 스캔)

사용법:
    DATABASE_URL=postgresql://foedev:foedev@localhost:5432/foedev python run_etl.py
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine

import loaders as L
import transforms as T
from parsers import (
    drop_key_only_rows,
    parse_company_info,
    parse_reference_sheet,
    parse_simple_sheet,
)

DATA_DIR = Path(__file__).resolve().parent / "data"
KODATA_FILE = DATA_DIR / "배포_샘플_KODATA_기업데이터_26-07-06.xlsx"
BTP_FILE = DATA_DIR / "배포_샘플_부산TP__사업기업목록_26-07-06.xlsx"


def get_engine():
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL 미설정 — .env 확인 (docker-compose와 동일 값)")
    return create_engine(url)


def load_companies_and_metrics(engine, xlsx_path: Path) -> pd.DataFrame:
    static_df, yearly_df = parse_company_info(str(xlsx_path))

    companies_cfg = L.load_config("companies")
    companies_out = L.apply_config(static_df, companies_cfg)
    n = L.write_table(engine, companies_out, "companies")
    print(f"  companies: {n}행")

    metrics_cfg = L.load_config("company_yearly_metrics")
    metrics_out = L.apply_config(yearly_df, metrics_cfg)
    n = L.write_table(engine, metrics_out, "company_yearly_metrics")
    print(f"  company_yearly_metrics: {n}행")

    cert_cfg = L.load_config("company_certifications")
    cert_rows = []
    for cert in cert_cfg["cert_columns"]:
        for _, row in static_df[["기업일련번호", cert]].iterrows():
            cert_rows.append({
                "company_id": T.to_int(row["기업일련번호"]),
                "cert_type": cert,
                "has_cert": T.yn_to_bool(row[cert]),
            })
    cert_out = pd.DataFrame(cert_rows)
    n = L.write_table(engine, cert_out, "company_certifications")
    print(f"  company_certifications: {n}행")

    return static_df


def load_patents(engine, xlsx_path: Path):
    cfg = L.load_config("patents")
    df = parse_simple_sheet(str(xlsx_path), cfg["sheet"], cfg["header_row"])
    out = L.apply_config(df, cfg)
    n = L.write_table(engine, out, "patents")
    print(f"  patents: {n}행")


def load_ntis(engine, xlsx_path: Path):
    for cfg_name, table in [("ntis_lead", "ntis_lead_projects"), ("ntis_consigned", "ntis_consigned_projects")]:
        cfg = L.load_config(cfg_name)
        df = parse_simple_sheet(str(xlsx_path), cfg["sheet"], cfg["header_row"])
        if cfg.get("drop_empty_except_key"):
            df = drop_key_only_rows(df, cfg["key"])
        out = L.apply_config(df, cfg)
        n = L.write_table(engine, out, table)
        print(f"  {table}: {n}행")


def load_business_purposes(engine, xlsx_path: Path):
    cfg = L.load_config("business_purposes")
    df = parse_simple_sheet(str(xlsx_path), cfg["sheet"], cfg["header_row"])
    out = L.apply_config(df, cfg)
    n = L.write_table(engine, out, "company_business_purposes")
    print(f"  company_business_purposes: {n}행")


def load_ref_tables(engine, xlsx_path: Path):
    biz_types, sup_types = parse_reference_sheet(str(xlsx_path))
    n = L.write_table(engine, biz_types, "ref_business_types")
    print(f"  ref_business_types: {n}행")
    n = L.write_table(engine, sup_types, "ref_support_types")
    print(f"  ref_support_types: {n}행")
    return biz_types, sup_types


def _year_from_sheet_name(sheet_name: str) -> int:
    m = re.match(r"(20\d{2})", sheet_name)
    if not m:
        raise ValueError(f"시트명에서 연도를 못 찾음: {sheet_name}")
    return int(m.group(1))


def load_support_programs_and_records(engine, xlsx_path: Path):
    prog_cfg = L.load_config("support_programs")
    prog_frames = []
    for sheet in prog_cfg["sheets"]:
        df = parse_simple_sheet(str(xlsx_path), sheet, prog_cfg["header_row"])
        df["year"] = _year_from_sheet_name(sheet)
        prog_frames.append(df)
    prog_all = pd.concat(prog_frames, ignore_index=True)
    prog_out = L.apply_config(prog_all, prog_cfg)
    n = L.write_table(engine, prog_out, "support_programs")
    print(f"  support_programs: {n}행")

    rec_cfg = L.load_config("support_records")
    rec_frames = []
    for sheet in rec_cfg["sheets"]:
        df = parse_simple_sheet(str(xlsx_path), sheet, rec_cfg["header_row"])
        df["year"] = _year_from_sheet_name(sheet)
        rec_frames.append(df)
    rec_all = pd.concat(rec_frames, ignore_index=True)
    rec_out = L.apply_config(rec_all, rec_cfg)
    n = L.write_table(engine, rec_out, "support_records")
    print(f"  support_records: {n}행")

    return rec_out


def build_industry_code_map(engine, support_records_out: pd.DataFrame):
    raw_codes = sorted({c for c in support_records_out["industry_code_raw"].dropna().unique()})
    rows = []
    for code in raw_codes:
        if re.match(r"^[A-Za-z]\d{4,6}$", code):
            rows.append({"raw_code": code, "normalized_code": code.upper(), "mapping_status": "already_normalized"})
        elif re.match(r"^\d{5}$", code):
            rows.append({"raw_code": code, "normalized_code": None, "mapping_status": "legacy_numeric_unmapped"})
        else:
            rows.append({"raw_code": code, "normalized_code": None, "mapping_status": "invalid"})
    out = pd.DataFrame(rows)
    n = L.write_table(engine, out, "industry_code_map")
    print(f"  industry_code_map: {n}행 (already_normalized={sum(out.mapping_status=='already_normalized')}, "
          f"legacy_numeric_unmapped={sum(out.mapping_status=='legacy_numeric_unmapped')}, "
          f"invalid={sum(out.mapping_status=='invalid')})")


def build_support_type_check(engine, support_records_out: pd.DataFrame, biz_types: pd.DataFrame, sup_types: pd.DataFrame):
    """support_records.support_detail_main/other → ref_support_types 대조 리포트.

    "지원구분(주요지원)"은 자유서술이 아니라 참고 시트의 지원구분참조(사업유형별 유효값)를
    따르는 통제 어휘다. 그런데 로딩 단계에서는 검증 없이 문자열 그대로 적재되어, 표기 차이
    (예 "기타" vs "기타(시비지원 포함)")나 오탈자가 조용히 섞여도 알 방법이 없었다. 값 자체를
    임의로 고치지 않고(도메인_출처=미상과 같은 원칙 — 참조표에 없다고 추정으로 정정하지 않음),
    대조 결과만 리포트 테이블로 남긴다.

    "지원구분(주요지원 외 작성 *패키지지원만)"(other)은 표 구조 자체가 다르다 — 콤마로 구분된
    자유서술 다중값("디자인, 마케팅" 등)이라 참조표의 단일값과 1:1 대조가 성립하지 않는다.
    콤마로 쪼갠 토큰 단위로 대조하되, field='other'로 구분해 main과 다른 성격임을 남긴다
    (other는 unmatched 비율이 높은 게 정상 — 통제 어휘 위반이 아니라 애초에 자유기술란).
    """
    valid_business_types = set(biz_types["business_type"])
    valid_combos = set(zip(sup_types["business_type"], sup_types["support_type"]))

    rows = []
    for field, col in [("main", "support_detail_main"), ("other", "support_detail_other")]:
        if col not in support_records_out.columns:
            continue
        sub = support_records_out[["business_type", col]].dropna(subset=[col])
        if field == "other":
            # 콤마 분리 다중값 → 토큰 단위로 펼친 뒤 집계 ("-" 같은 비값 표기는 제외)
            exploded = sub.assign(**{col: sub[col].str.split(",")}).explode(col)
            exploded[col] = exploded[col].str.strip()
            sub = exploded[exploded[col].ne("-") & exploded[col].ne("")]
        counts = sub.groupby(["business_type", col]).size().reset_index(name="record_count")
        for _, r in counts.iterrows():
            bt, detail, n = r["business_type"], r[col], int(r["record_count"])
            if bt not in valid_business_types:
                status = "unmatched_business_type"
            elif (bt, detail) in valid_combos:
                status = "matched"
            else:
                status = "unmatched_combo"
            rows.append({
                "business_type": bt, "support_detail": detail, "field": field,
                "match_status": status, "record_count": n,
            })

    out = pd.DataFrame(rows)
    n = L.write_table(engine, out, "support_type_check")
    unmatched_main = out[(out["field"] == "main") & (out["match_status"] != "matched")]
    unmatched_other = out[(out["field"] == "other") & (out["match_status"] != "matched")]
    print(f"  support_type_check: {n}행 (main 불일치 {len(unmatched_main)}건 / other 참고 {len(unmatched_other)}건)")
    if len(unmatched_main):
        print("  ⚠️  참조표와 불일치하는 지원구분(주요지원) 표기 — 오탈자/신규 값 확인 필요:")
        for _, r in unmatched_main.iterrows():
            print(f"     [{r['match_status']}] 사업유형={r['business_type']!r} 지원구분={r['support_detail']!r} "
                  f"({r['record_count']}건)")


def main():
    parser = argparse.ArgumentParser(description="KODATA/부산TP 엑셀 → PostgreSQL ETL")
    parser.add_argument("--kodata", default=str(KODATA_FILE))
    parser.add_argument("--btp", default=str(BTP_FILE))
    args = parser.parse_args()

    engine = get_engine()

    print("1) companies / company_yearly_metrics / company_certifications")
    load_companies_and_metrics(engine, Path(args.kodata))

    print("2) patents")
    load_patents(engine, Path(args.kodata))

    print("3) ntis_lead_projects / ntis_consigned_projects")
    load_ntis(engine, Path(args.kodata))

    print("4) company_business_purposes")
    load_business_purposes(engine, Path(args.kodata))

    print("5) ref_business_types / ref_support_types")
    biz_types, sup_types = load_ref_tables(engine, Path(args.btp))

    print("6) support_programs / support_records")
    rec_out = load_support_programs_and_records(engine, Path(args.btp))

    print("7) industry_code_map")
    build_industry_code_map(engine, rec_out)

    print("8) support_type_check")
    build_support_type_check(engine, rec_out, biz_types, sup_types)

    print("\n✅ ETL 완료")


if __name__ == "__main__":
    main()

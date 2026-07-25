"""원본 엑셀 시트 → tidy DataFrame 파서.

KODATA/부산TP 원본 시트는 타이틀/주석 행이 헤더 위에 섞여 있고, 특히
'1. 기업정보' 시트는 연도(2020~2024)가 컬럼으로 반복되는 wide 포맷에 병합 헤더까지
있어 header=<고정행번호>만으로는 못 읽는다.

여기 파서들은 실제 발제 데이터가 샘플과 컬럼 순서/개수가 달라져도(연도 추가 등)
헤더 셀의 "내용"(라벨 텍스트, 연도 숫자)을 기준으로 동작하도록 만들어졌다.
컬럼 위치를 하드코딩하지 않고, row4/row5 헤더 라벨을 스캔해서 그룹을 스스로 찾는다.
"""

from __future__ import annotations

import re

import pandas as pd
from pandas.api import types as ptypes

from transforms import blank_to_none

_WS = re.compile(r"[\n\r]+")


def _clean_label(v) -> str:
    return _WS.sub("", str(v)).strip()


def blanks_to_nan(df: pd.DataFrame) -> pd.DataFrame:
    """object/문자열 컬럼의 공백-only 값(' ')을 NaN으로 통일한다.

    원본 시트는 '값 없음'을 빈 셀이 아니라 공백 한 글자로 채운 곳이 많다. 그 상태로
    DataFrame에 들어오면 isna()가 False라 결측률을 세는 분석이 전부 0%로 나온다
    (실측: 기업규모 158건/5.5%, 재무 컬럼 3,000건대/21~26%가 '결측 없음'으로 보고됐다).

    dtype == object로만 거르면 안 된다 — pandas 3.0부터 문자열 컬럼 dtype이 str이라
    정작 대상 컬럼을 통째로 놓친다. 그래서 '숫자/날짜/불리언이 아닌 것'을 대상으로 뒤집어 판정한다.

    loaders는 셀 단위로 blank_to_none을 태우므로 DB 적재 경로의 결과는 달라지지 않고,
    raw DataFrame을 그대로 쓰는 EDA·분석 경로만 바로잡힌다.
    """
    for col in df.columns:
        s = df[col]
        if (ptypes.is_numeric_dtype(s) or ptypes.is_datetime64_any_dtype(s)
                or ptypes.is_bool_dtype(s)):
            continue
        blank = s.astype(str).str.strip().eq("")
        if blank.any():
            df[col] = s.mask(blank)
    return df


# ============================================================
# 1. 기업정보 (wide, 병합헤더)
# ============================================================
def _group_spans(row: pd.Series, start_col: int) -> list[tuple[str, list[int]]]:
    """row를 start_col부터 ffill한 뒤, 같은 라벨이 이어지는 컬럼 구간 목록을 반환."""
    filled = row.ffill()
    spans: list[tuple[str, list[int]]] = []
    cur_label, cur_cols = None, []
    for j in range(start_col, len(filled)):
        lab = filled.iloc[j]
        if pd.isna(lab):
            continue
        lab = _clean_label(lab)
        if lab != cur_label:
            if cur_cols:
                spans.append((cur_label, cur_cols))
            cur_label, cur_cols = lab, [j]
        else:
            cur_cols.append(j)
    if cur_cols:
        spans.append((cur_label, cur_cols))
    return spans


def _is_year(v) -> bool:
    try:
        return 2000 <= int(v) <= 2035
    except (TypeError, ValueError):
        return False


def parse_company_info(xlsx_path: str, sheet_name: str = "1. 기업정보"):
    """반환: (static_df, yearly_long_df)
    static_df   : company_id 1행당 정적 속성(개요/인증/연구소) — companies, company_certifications 원천
    yearly_long_df: (company_id, year, metric...) long — company_yearly_metrics 원천
    """
    raw = pd.read_excel(xlsx_path, sheet_name=sheet_name, header=None)
    group_label_row = raw.iloc[4]
    sub_label_row = raw.iloc[5]
    data = raw.iloc[6:].reset_index(drop=True)

    # --- 정적 섹션: 그룹라벨이 시작되기 전 컬럼들(기업일련번호~주요제품) ---
    first_group_col = min(c for c, v in enumerate(group_label_row) if pd.notna(v))
    static_cols = {}
    for j in range(0, first_group_col):
        name = _clean_label(sub_label_row.iloc[j])
        static_cols[name] = data.iloc[:, j]

    year_records: dict[str, dict[int, pd.Series]] = {}
    single_cols: dict[str, pd.Series] = {}

    for label, cols in _group_spans(group_label_row, first_group_col):
        subvals = [sub_label_row.iloc[c] for c in cols]
        if len(cols) > 1 and all(_is_year(v) for v in subvals):
            year_records.setdefault(label, {})
            for c, y in zip(cols, subvals):
                year_records[label][int(y)] = data.iloc[:, c]
        elif len(cols) == 1:
            single_cols[label] = data.iloc[:, cols[0]]
        else:
            for c, sv in zip(cols, subvals):
                sub = _clean_label(sv)
                key = label if sub == label else f"{label}_{sub}"
                single_cols[key] = data.iloc[:, c]

    static_df = pd.DataFrame({**static_cols, **single_cols})
    static_df = static_df[static_df["기업일련번호"].notna()].reset_index(drop=True)

    key = static_cols["기업일련번호"].reset_index(drop=True)
    long_frames = []
    for metric, year_map in year_records.items():
        for year, series in year_map.items():
            long_frames.append(pd.DataFrame({
                "기업일련번호": key,
                "year": year,
                "metric": metric,
                "value": series.reset_index(drop=True),
            }))
    long_stacked = pd.concat(long_frames, ignore_index=True)
    yearly_long_df = long_stacked.pivot_table(
        index=["기업일련번호", "year"], columns="metric", values="value", aggfunc="first"
    ).reset_index()
    yearly_long_df = yearly_long_df[yearly_long_df["기업일련번호"].notna()].reset_index(drop=True)

    return blanks_to_nan(static_df), blanks_to_nan(yearly_long_df)


# ============================================================
# 단순 헤더 시트 (헤더 1행 + 데이터) 공용 파서
# ============================================================
def parse_simple_sheet(xlsx_path: str, sheet_name: str, header_row: int) -> pd.DataFrame:
    df = pd.read_excel(xlsx_path, sheet_name=sheet_name, header=header_row)
    df = df.dropna(how="all")
    # 엑셀 왼쪽의 빈 인덱스 컬럼("Unnamed: 0") 제거
    df = df.loc[:, [c for c in df.columns if not str(c).startswith("Unnamed:")]]
    df.columns = [_clean_label(c) for c in df.columns]
    return blanks_to_nan(df).reset_index(drop=True)


def drop_key_only_rows(df: pd.DataFrame, key_col: str) -> pd.DataFrame:
    """key_col 외 전 컬럼이 결측인 행 제거 (NTIS 위탁 시트 등에서 발견되는 빈 placeholder 행)."""
    other_cols = [c for c in df.columns if c != key_col]
    mask = df[other_cols].notna().any(axis=1)
    return df[mask].reset_index(drop=True)


# ============================================================
# 참고 시트 (사업구분참조 / 지원구분참조 — 2단 반정형 표)
# ============================================================
def parse_reference_sheet(xlsx_path: str, sheet_name: str = "참고"):
    raw = pd.read_excel(xlsx_path, sheet_name=sheet_name, header=None)

    macro_row = raw.iloc[2]
    biz_row = raw.iloc[3]
    biz_cols = [c for c in range(1, raw.shape[1]) if pd.notna(biz_row.iloc[c])]
    business_types = pd.DataFrame({
        "business_type": [_clean_label(biz_row.iloc[c]) for c in biz_cols],
        "macro_category": [_clean_label(macro_row.iloc[c]) for c in biz_cols],
    }).drop_duplicates(subset="business_type").reset_index(drop=True)

    header_row = raw.iloc[6]
    rows = []
    for c in biz_cols:
        bt = _clean_label(header_row.iloc[c])
        for r in range(7, raw.shape[0]):
            v = blank_to_none(raw.iloc[r, c])
            if v is None or _clean_label(v) == "-":
                continue
            rows.append({"business_type": bt, "support_type": _clean_label(v)})
    support_types = pd.DataFrame(rows).drop_duplicates().reset_index(drop=True)

    return blanks_to_nan(business_types), blanks_to_nan(support_types)

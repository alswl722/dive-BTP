"""축8 whitelist CSV 생성기 (재실행 가능).

원본 엑셀(data1/data2)에서 관측된 (KSIC 대분류, business_type) 조합을 뽑아
`axis8_whitelist.csv`에 저장한다.

핵심 원칙:
- **positive whitelist**: 관측된 조합만 "정합 확정"으로 표시. 미관측 조합은 이상 아님(판단유보 → LLM 대상)
- 임계값·조합 하드코딩 없음(원칙3). 원본 데이터에서 그때그때 스캔
- 참고시트(사업구분참조)와 실제 관측의 불일치도 함께 기록 → 발표 시 데이터 품질 언급 근거
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd
import yaml

_APP_DIR = Path(__file__).resolve().parents[1]
_BACKEND_DIR = _APP_DIR.parent
_ROOT_DIR = _BACKEND_DIR.parent

sys.path.insert(0, str(_BACKEND_DIR / "etl"))
from parsers import parse_company_info, parse_reference_sheet  # noqa: E402

DEFAULT_KODATA = _ROOT_DIR / "data1.xlsx"
DEFAULT_BTP = _ROOT_DIR / "data2.xlsx"
DEFAULT_OUT = Path(__file__).resolve().parent / "axis8_whitelist.csv"
DEFAULT_THRESHOLDS = Path(__file__).resolve().parent / "axis8_thresholds.yaml"


def _ksic_major(code: object) -> str | None:
    """KSIC 11차 코드 대분류(첫 알파벳). 5자리 숫자·NULL은 None."""
    if code is None or pd.isna(code):
        return None
    s = str(code).strip()
    return s[0] if s and s[0].isalpha() else None


def _load_support_records(btp_path: Path) -> pd.DataFrame:
    parts = []
    for year in (2022, 2023, 2024):
        df = pd.read_excel(btp_path, sheet_name=f"{year}_기업지원목록", header=2)
        df["year"] = year
        parts.append(df)
    df = pd.concat(parts, ignore_index=True)
    df = df.rename(columns={"기업일련번호": "company_id", "사업유형": "business_type"})
    df = df.dropna(subset=["company_id", "business_type"])
    df["company_id"] = df["company_id"].astype(int)
    return df[["company_id", "business_type", "year"]]


def _observed_matrix(kodata_path: Path, btp_path: Path) -> pd.DataFrame:
    """(ksic_major, business_type) → 관측 지원건수."""
    static_df, _ = parse_company_info(str(kodata_path))
    ksic = static_df.rename(columns={"기업일련번호": "company_id"})[["company_id", "KSIC코드(11차)"]]
    ksic["company_id"] = ksic["company_id"].astype(int)
    ksic["ksic_major"] = ksic["KSIC코드(11차)"].apply(_ksic_major)

    sr = _load_support_records(btp_path)
    merged = sr.merge(ksic[["company_id", "ksic_major"]], on="company_id", how="left")
    grouped = (
        merged.groupby(["ksic_major", "business_type"], dropna=False)
        .size()
        .reset_index(name="sample_count")
    )
    return grouped


def _load_thresholds(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def _confidence(sample_count: int, tiers: dict) -> str:
    """관측 빈도 기반 신뢰도 라벨. threshold는 axis8_thresholds.yaml에서 로드."""
    if sample_count >= tiers["high_count"]:
        return "high"
    if sample_count >= tiers["medium_count"]:
        return "medium"
    return "low"


def build(kodata_path: Path, btp_path: Path, out_path: Path, thresholds_path: Path) -> pd.DataFrame:
    cfg = _load_thresholds(thresholds_path)
    tiers = cfg["confidence_tiers"]
    observed = _observed_matrix(kodata_path, btp_path)
    ref_bt, _ = parse_reference_sheet(str(btp_path))
    ref_types = set(ref_bt["business_type"].dropna())

    observed = observed[observed["ksic_major"].notna()].copy()
    observed["source"] = "observed_sample"
    observed["confidence"] = observed["sample_count"].apply(lambda n: _confidence(n, tiers))
    observed["notes"] = observed["business_type"].apply(
        lambda bt: "" if bt in ref_types else "참고시트 미등재(관측 존재)"
    )

    ref_only = ref_types - set(observed["business_type"])
    ref_rows = pd.DataFrame([
        {
            "ksic_major": None,
            "business_type": bt,
            "sample_count": 0,
            "source": "reference_sheet_only",
            "confidence": "low",
            "notes": "참고시트 등재·샘플 미관측 → 본선 재확인 필요",
        }
        for bt in sorted(ref_only)
    ])

    result = pd.concat([observed, ref_rows], ignore_index=True)
    result = result[["ksic_major", "business_type", "sample_count", "source", "confidence", "notes"]]
    result = result.sort_values(
        ["source", "ksic_major", "sample_count"],
        ascending=[True, True, False],
    ).reset_index(drop=True)

    header_comment = (
        "# 축8 정합성 판정 whitelist — positive only\n"
        "# 미관측 (ksic_major, business_type) 조합은 '이상' 아님. 판단유보 → LLM 2단 호출 대상.\n"
        "# confidence=low(관측 1~2건)도 자기참조 편향 방어 위해 LLM 재확인 대상 "
        "(axis8_thresholds.yaml:accept_confidence).\n"
        "# 샘플 11개 편향 — 임계값·조합 확정 금지. 본선 데이터에서 build_axis8_whitelist.py 재실행.\n"
    )
    with out_path.open("w", encoding="utf-8-sig") as f:
        f.write(header_comment)
        result.to_csv(f, index=False)

    print(f"[axis8_whitelist] 관측 {len(observed)}조합 · 참조 미관측 {len(ref_rows)}건")
    print(f"신뢰도 분포: {result['confidence'].value_counts().to_dict()}")
    print(f"저장: {out_path}")
    return result


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--kodata", type=Path, default=DEFAULT_KODATA)
    ap.add_argument("--btp", type=Path, default=DEFAULT_BTP)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--thresholds", type=Path, default=DEFAULT_THRESHOLDS)
    args = ap.parse_args()
    build(args.kodata, args.btp, args.out, args.thresholds)


if __name__ == "__main__":
    main()

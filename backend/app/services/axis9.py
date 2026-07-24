"""축9 BTP 지원이력 flagging 서비스.

역할:
- 기업별 3축 요약 (지원건수 · 총지원금 · 연속수혜연수) + 사업유형 다양성
- 세그먼트 분류 (소액다건 / 대형소수 / 대형다건 / 소액소수)
- flag 판정 truth table (반복 × 성장 교차) — **성장률은 축1(민지) 산출 대기, 현재 mock**

핵심 원칙 (docs/축9_설계노트.md):
- 임계값 하드코딩 없음 — `axis9_thresholds.yaml` (percentile 기반)
- 축1(성장성) 결과 소비만, 재계산 금지 — `GrowthSignal` 인터페이스 (docs/성장률_인터페이스.md)
- `build_rankings`(company_view.py) 재구현 금지 — 이 서비스는 flag 판정만
- 표본 편향 방어: percentile은 매 호출 시 넘어온 데이터셋에서 실시간 산출
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import numpy as np
import pandas as pd
import yaml

_CONFIG_DIR = Path(__file__).resolve().parents[1] / "config"
THRESHOLDS_PATH = _CONFIG_DIR / "axis9_thresholds.yaml"

Segment = Literal["소액다건", "대형소수", "대형다건", "소액소수"]
FlagStatus = Literal["flag", "cleared", "observe", "normal", "unknown"]


@dataclass(frozen=True)
class SupportMetrics:
    """기업별 3축 요약 + 다양성."""

    company_id: int
    support_count: int
    total_amount_thousand_krw: float
    years_present: int
    max_consecutive_years: int
    business_type_diversity: int


@dataclass(frozen=True)
class GrowthSignal:
    """축1(민지) 산출 인터페이스 계약.

    현재는 mock/None. 실제는 docs/성장률_인터페이스.md 스펙 준수.
    """

    company_id: int
    growth_score: float | None      # 0~100 백분위 스케일. None = 축1 데이터 없음
    revenue_cagr: float | None      # decimal (e.g. 0.15 = 15%)
    revenue_delta: float | None     # 천원 단위


@dataclass(frozen=True)
class SegmentClassification:
    company_id: int
    segment: Segment
    is_high_diversity: bool         # 사업유형 다양성 상위 percentile 여부


@dataclass(frozen=True)
class FlagClassification:
    company_id: int
    status: FlagStatus
    is_repeat: bool
    growth_state: Literal["stagnant", "growing", "unknown"]
    label: str                      # 발표·화면 노출용 한 줄 라벨


def load_config(path: Path | str | None = None) -> dict:
    """axis9_thresholds.yaml 로드."""
    p = Path(path) if path else THRESHOLDS_PATH
    if not p.exists():
        raise FileNotFoundError(f"axis9 config 없음: {p}")
    with p.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f)


# ============================================================
# 계산 (eda/axis9_duplicate.py의 로직을 함수로 이관)
# ============================================================
def _max_consecutive_years(years: list[int]) -> int:
    if not years:
        return 0
    ys = sorted(set(int(y) for y in years))
    max_run = cur = 1
    for i in range(1, len(ys)):
        if ys[i] == ys[i - 1] + 1:
            cur += 1
            max_run = max(max_run, cur)
        else:
            cur = 1
    return max_run


def compute_support_metrics(sr: pd.DataFrame) -> pd.DataFrame:
    """support_records(개별 지원레코드) → 기업별 요약 DataFrame.

    Expected columns: company_id, year, business_type, support_detail_main,
    support_amount_thousand_krw, program_code

    Returns:
        DataFrame with SupportMetrics fields as columns.
    """
    df = sr.copy()
    df["support_amount_thousand_krw"] = pd.to_numeric(
        df["support_amount_thousand_krw"], errors="coerce"
    ).fillna(0)

    grouped = df.groupby("company_id").agg(
        support_count=("program_code", "count"),
        total_amount_thousand_krw=("support_amount_thousand_krw", "sum"),
        years_present=("year", "nunique"),
        business_type_diversity=("business_type", "nunique"),
    ).reset_index()

    consecutive = (
        df.groupby("company_id")["year"]
        .apply(lambda s: _max_consecutive_years(s.dropna().tolist()))
        .reset_index(name="max_consecutive_years")
    )
    grouped = grouped.merge(consecutive, on="company_id", how="left")
    return grouped[
        [
            "company_id",
            "support_count",
            "total_amount_thousand_krw",
            "years_present",
            "max_consecutive_years",
            "business_type_diversity",
        ]
    ]


# ============================================================
# 세그먼트 판정 (4분면)
# ============================================================
def _percentile_threshold(series: pd.Series, percentile: float) -> float:
    """넘어온 데이터셋 내 percentile 값. 표본 편향 방어의 핵심."""
    return float(series.quantile(percentile / 100.0))


def classify_segments(metrics_df: pd.DataFrame, config: dict) -> pd.DataFrame:
    """batch 세그먼트 분류. metrics_df는 compute_support_metrics 결과."""
    if metrics_df.empty:
        # quantile()이 빈 Series에서 NaN을 반환하면 >= 비교가 전부 False가 되어
        # 전 기업이 조용히 "소액소수"(정상)로 오분류된다 — 에러 없이 틀리는 게 더
        # 위험하므로 빈 입력은 빈 결과로 명시 처리한다.
        return pd.DataFrame(columns=["company_id", "segment", "is_high_diversity"])

    cfg = config["segment_thresholds"]
    diversity_cfg = config["diversity"]

    count_th = _percentile_threshold(
        metrics_df["support_count"], cfg["support_count_percentile"]
    )
    amount_th = _percentile_threshold(
        metrics_df["total_amount_thousand_krw"], cfg["total_amount_percentile"]
    )
    div_th = _percentile_threshold(
        metrics_df["business_type_diversity"], diversity_cfg["high_percentile"]
    )

    is_many = metrics_df["support_count"] >= count_th
    is_large = metrics_df["total_amount_thousand_krw"] >= amount_th

    segments = np.where(
        is_many & is_large, "대형다건",
        np.where(
            is_many & ~is_large, "소액다건",
            np.where(
                ~is_many & is_large, "대형소수", "소액소수"
            ),
        ),
    )

    return pd.DataFrame({
        "company_id": metrics_df["company_id"],
        "segment": segments,
        "is_high_diversity": metrics_df["business_type_diversity"] >= div_th,
    })


# ============================================================
# 성장률 인터페이스 (mock — 민지 산출 대기)
# ============================================================
def mock_growth_signal(company_id: int, mode: str = "unknown") -> GrowthSignal:
    """민지 산출 없을 때 임시 mock. Phase 5 통합 전까지 사용.

    mode:
      - "unknown": growth_score=None → flag 판정 시 "unknown" 상태
      - "growing": growth_score=80.0
      - "stagnant": growth_score=15.0
    """
    if mode == "growing":
        return GrowthSignal(company_id, growth_score=80.0, revenue_cagr=0.15, revenue_delta=None)
    if mode == "stagnant":
        return GrowthSignal(company_id, growth_score=15.0, revenue_cagr=-0.02, revenue_delta=None)
    return GrowthSignal(company_id, growth_score=None, revenue_cagr=None, revenue_delta=None)


def growth_signals_from_axis1(axis1_df: pd.DataFrame) -> dict[int, GrowthSignal]:
    """민지 축1 산출 DataFrame → dict[company_id, GrowthSignal].

    민지 실제 산출 (scoring_finance.py:compute_scores + features_finance.py):
      - 기업일련번호  (필수, 조인 키)
      - 성장성점수    (필수, 축9 flag 판정에 사용)
      - 매출_CAGR    (옵션, features_finance 컬럼. join된 상태로 넘어오면 소비)
      - 매출_증가액   (옵션, 있으면 revenue_delta로 매핑)

    자본잠식·재무 결측 케이스는 민지 finance_utils.safe_cagr/safe_ratio가
    NaN 반환 → 여기서 None으로 매핑 → flag 판정 시 status="unknown".
    """
    KEY_COL = "기업일련번호"
    SCORE_COL = "성장성점수"
    CAGR_COL = "매출_CAGR"        # 옵션
    DELTA_COL = "매출_증가액"      # 옵션

    for required in (KEY_COL, SCORE_COL):
        if required not in axis1_df.columns:
            raise ValueError(
                f"축1 산출 필수 컬럼 '{required}' 없음. docs/성장률_인터페이스.md 참조"
            )

    has_cagr = CAGR_COL in axis1_df.columns
    has_delta = DELTA_COL in axis1_df.columns

    out: dict[int, GrowthSignal] = {}
    for _, row in axis1_df.iterrows():
        if pd.isna(row[KEY_COL]):  # 조인 키 결측 행은 어느 기업인지 알 수 없어 int() 변환 불가
            continue
        cid = int(row[KEY_COL])
        score = None if pd.isna(row[SCORE_COL]) else float(row[SCORE_COL])
        cagr = float(row[CAGR_COL]) if has_cagr and pd.notna(row[CAGR_COL]) else None
        delta = float(row[DELTA_COL]) if has_delta and pd.notna(row[DELTA_COL]) else None
        out[cid] = GrowthSignal(
            company_id=cid,
            growth_score=score,
            revenue_cagr=cagr,
            revenue_delta=delta,
        )
    return out


# ============================================================
# Flag 판정 truth table
# ============================================================
def _is_repeat(metrics_row: pd.Series, metrics_df: pd.DataFrame, config: dict) -> bool:
    """반복지원 판정 — 다음 조건 중 하나라도 만족하면 True (OR):
    1. config['flag_logic']['repeat_metrics'] 중 하나가 상위 percentile 초과 (상대)
    2. config['flag_logic']['repeat_absolute_min'] 중 하나가 절대값 초과 (CLAUDE.md 원문 방식)

    2번은 샘플 편향(전원 반복선정) 방어 · CLAUDE.md의 `GROUP BY HAVING COUNT >= N` 정신.
    """
    cfg = config["flag_logic"]
    seg_cfg = config["segment_thresholds"]

    # 1. 상대 percentile 판정
    for metric in cfg.get("repeat_metrics", []):
        if metric == "support_count":
            th = _percentile_threshold(
                metrics_df["support_count"], seg_cfg["support_count_percentile"]
            )
        elif metric == "total_amount_thousand_krw":
            th = _percentile_threshold(
                metrics_df["total_amount_thousand_krw"], seg_cfg["total_amount_percentile"]
            )
        else:
            continue
        if metrics_row[metric] >= th:
            return True

    # 2. 절대값 최소선 판정 (config 있을 때만)
    absolute_min = cfg.get("repeat_absolute_min") or {}
    for metric, min_val in absolute_min.items():
        if metric in metrics_row and metrics_row[metric] >= min_val:
            return True

    return False


def _growth_state(signal: GrowthSignal, config: dict) -> Literal["stagnant", "growing", "unknown"]:
    if signal.growth_score is None:
        return "unknown"
    threshold = config["flag_logic"]["growth_score_stagnant"]
    return "stagnant" if signal.growth_score < threshold else "growing"


def _flag_label(status: FlagStatus) -> str:
    return {
        "flag":    "지원 반복 · 성과 정체",
        "cleared": "지원 효과 확인",
        "observe": "단발 지원 · 성과 정체 관측",
        "normal":  "정상",
        "unknown": "성장률 미제공 (축1 대기)",
    }[status]


def classify_flag(
    metrics_row: pd.Series,
    metrics_df: pd.DataFrame,
    signal: GrowthSignal,
    config: dict,
) -> FlagClassification:
    """단일 기업 flag 판정 — truth table 적용."""
    cid = int(metrics_row["company_id"])
    is_repeat = _is_repeat(metrics_row, metrics_df, config)
    growth = _growth_state(signal, config)

    if growth == "unknown":
        status: FlagStatus = "unknown"
    elif is_repeat and growth == "stagnant":
        status = "flag"
    elif is_repeat and growth == "growing":
        status = "cleared"
    elif not is_repeat and growth == "stagnant":
        status = "observe"
    else:
        status = "normal"

    return FlagClassification(
        company_id=cid,
        status=status,
        is_repeat=is_repeat,
        growth_state=growth,
        label=_flag_label(status),
    )


def classify_flags_batch(
    metrics_df: pd.DataFrame,
    growth_signals: dict[int, GrowthSignal] | None,
    config: dict,
) -> pd.DataFrame:
    """batch flag 판정 — Phase 5에서 rankings 위 flag 필드로 붙일 결과.

    growth_signals=None이면 전 기업 mock unknown.
    """
    rows = []
    for _, m in metrics_df.iterrows():
        cid = int(m["company_id"])
        signal = (
            growth_signals[cid] if growth_signals and cid in growth_signals
            else mock_growth_signal(cid, mode="unknown")
        )
        cls = classify_flag(m, metrics_df, signal, config)
        rows.append({
            "company_id": cls.company_id,
            "flag": cls.status,
            "flag_label": cls.label,
            "is_repeat": cls.is_repeat,
            "growth_state": cls.growth_state,
        })
    return pd.DataFrame(rows)


# ============================================================
# 스모크 테스트
# ============================================================
if __name__ == "__main__":
    config = load_config()
    print(f"[axis9] config 로드: {list(config.keys())}")

    # 가상 데이터로 파이프라인 테스트
    sample = pd.DataFrame([
        # 소액다건 + 정체 → flag
        {"company_id": 1786, "year": 2022, "business_type": "패키지지원", "support_detail_main": "A", "support_amount_thousand_krw": 5000, "program_code": "P1"},
        {"company_id": 1786, "year": 2022, "business_type": "기술지원",   "support_detail_main": "B", "support_amount_thousand_krw": 3000, "program_code": "P2"},
        {"company_id": 1786, "year": 2023, "business_type": "사업화지원", "support_detail_main": "C", "support_amount_thousand_krw": 10000, "program_code": "P3"},
        {"company_id": 1786, "year": 2023, "business_type": "스마트공장", "support_detail_main": "D", "support_amount_thousand_krw": 20000, "program_code": "P4"},
        {"company_id": 1786, "year": 2024, "business_type": "패키지지원", "support_detail_main": "E", "support_amount_thousand_krw": 15000, "program_code": "P5"},
        # 대형소수 + 성장 → cleared
        {"company_id": 1178, "year": 2022, "business_type": "스마트공장", "support_detail_main": "F", "support_amount_thousand_krw": 100000, "program_code": "P6"},
        {"company_id": 1178, "year": 2023, "business_type": "패키지지원", "support_detail_main": "G", "support_amount_thousand_krw": 150000, "program_code": "P7"},
        # 단발
        {"company_id": 1878, "year": 2024, "business_type": "기타",       "support_detail_main": "H", "support_amount_thousand_krw": 8000, "program_code": "P8"},
    ])

    metrics_df = compute_support_metrics(sample)
    print("\n=== metrics ===")
    print(metrics_df.to_string(index=False))

    seg_df = classify_segments(metrics_df, config)
    print("\n=== segments ===")
    print(seg_df.to_string(index=False))

    # 3개 시나리오 mock
    growth_signals = {
        1786: mock_growth_signal(1786, mode="stagnant"),   # 정체
        1178: mock_growth_signal(1178, mode="growing"),    # 성장
        1878: mock_growth_signal(1878, mode="stagnant"),   # 정체 (단발)
    }
    flag_df = classify_flags_batch(metrics_df, growth_signals, config)
    print("\n=== flags (mock 성장률) ===")
    print(flag_df.to_string(index=False))

    # 성장률 없는 경우
    flag_df_no_growth = classify_flags_batch(metrics_df, None, config)
    print("\n=== flags (성장률 mock=None, 축1 대기) ===")
    print(flag_df_no_growth.to_string(index=False))

    # 민지 실제 컬럼(한글)을 흉내낸 DataFrame으로 growth_signals_from_axis1 검증
    axis1_sample = pd.DataFrame([
        {"기업일련번호": 1786, "성장성점수": 15.0, "매출_CAGR": -0.02},   # 정체
        {"기업일련번호": 1178, "성장성점수": 82.5, "매출_CAGR":  0.18},   # 성장
        {"기업일련번호": 1878, "성장성점수":  float("nan"), "매출_CAGR": float("nan")},  # 자본잠식 등
    ])
    signals_from_axis1 = growth_signals_from_axis1(axis1_sample)
    print("\n=== growth_signals_from_axis1 (민지 실 컬럼 매핑) ===")
    for cid, sig in signals_from_axis1.items():
        print(f"  {cid}: score={sig.growth_score} cagr={sig.revenue_cagr}")
    flag_df_axis1 = classify_flags_batch(metrics_df, signals_from_axis1, config)
    print("\n=== flags (민지 산출 실 컬럼 소비) ===")
    print(flag_df_axis1.to_string(index=False))

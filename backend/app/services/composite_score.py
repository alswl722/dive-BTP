"""종합점수 서비스 — 재무 4축 + 기술 2축 + 축8 정합성을 심사 스크리닝용 단일 지표로 요약.

핵심 원칙 (docs/재무축_설계노트.md §5 "종합점수 없음" 원칙과의 관계):
- 축별 점수(성장성/수익성/효율성/안정성/R&D특허/NTIS/정합성)는 그대로 유지한다.
  종합점수는 이 원칙을 뒤집는 게 아니라, 그 위에 얹는 **보조 지표**다.
  화면에는 항상 종합점수 + 축별 breakdown을 함께 노출해야 한다(종합점수 단독 표기 금지).
- 최저축 캡: 종합점수 = min(가중평균, 최저축점수 + cap_margin).
  이유(2379 실증, docs/재무축_설계노트.md §6): 단순 평균은 "한 축이 무너지고 있다"는
  신호를 다른 축의 높은 점수로 희석한다. 캡을 씌워 최저축이 종합점수 상한을 정하게 해서
  축 어긋남이 종합점수 뒤에 완전히 숨지 않게 방어한다.
- 가중치는 절대 하드코딩하지 않고 composite_score_weights.yaml에서 로드
  (원칙3 config 기반, 다른 축들과 동일).
- 축9(BTP 지원이력 flagging)는 설계상 "역량 스코어 미포함"(docs/축9_설계노트.md §1) —
  종합점수 계산에서 제외. company_view.py가 이미 duplicateFlag를 별도 필드로 병기하므로
  화면에서 종합점수 옆에 경고 배지로만 노출.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml

_CONFIG_DIR = Path(__file__).resolve().parents[1] / "config"
WEIGHTS_PATH = _CONFIG_DIR / "composite_score_weights.yaml"


@dataclass(frozen=True)
class CompositeScore:
    company_id: int
    score: float | None              # 최종 종합점수(캡 적용 후). 결측 가드 걸리면 None
    raw_weighted_average: float | None  # 캡 적용 전 가중평균(참고용)
    lowest_axis: str | None          # 최저축 이름
    lowest_axis_score: float | None
    valid_axis_ratio: float          # 유효(NaN 아닌) 축 비율
    breakdown: dict[str, float | None] = field(default_factory=dict)  # 축별 원점수


def load_weights(path: Path | str | None = None) -> dict:
    """composite_score_weights.yaml 로드."""
    p = Path(path) if path else WEIGHTS_PATH
    if not p.exists():
        raise FileNotFoundError(f"composite_score config 없음: {p}")
    with p.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def _resolve_axis_weights(config: dict) -> dict[str, float]:
    """그룹 가중치 + 그룹 내부 균등분배(axis_overrides 있으면 우선) → 축별 최종 가중치.

    합이 1.0이 되도록 정규화한다(그룹 가중치 합이 반올림 오차로 1.0이 아닐 수 있음).
    """
    groups: dict[str, float] = config["groups"]
    axes_by_group: dict[str, list[str]] = config["axes"]
    overrides: dict[str, float] = config.get("axis_overrides") or {}

    weights: dict[str, float] = {}
    for group, group_weight in groups.items():
        axis_names = axes_by_group.get(group, [])
        if not axis_names:
            continue
        override_axes = {a: overrides[a] for a in axis_names if a in overrides}
        remaining_axes = [a for a in axis_names if a not in overrides]
        override_sum = sum(override_axes.values())
        per_axis = (
            (group_weight - override_sum) / len(remaining_axes)
            if remaining_axes else 0.0
        )
        for a in axis_names:
            weights[a] = overrides[a] if a in override_axes else per_axis

    total = sum(weights.values())
    if total <= 0:
        raise ValueError("composite_score 가중치 합이 0 이하 — config 확인 필요")
    return {a: w / total for a, w in weights.items()}


def compute_composite_score(
    company_id: int,
    axis_scores: dict[str, float | None],
    config: dict | None = None,
) -> CompositeScore:
    """단일 기업의 축별 점수(0~100, NaN 가능) → 종합점수.

    axis_scores 키는 config["axes"]에 나열된 축 이름(성장성/수익성/효율성/안정성/
    R&D특허/NTIS/정합성)과 일치해야 한다. 없는 축은 결측으로 취급.
    """
    cfg = config or load_weights()
    weights = _resolve_axis_weights(cfg)

    breakdown = {axis: axis_scores.get(axis) for axis in weights}
    valid = {a: s for a, s in breakdown.items() if s is not None}
    valid_ratio = len(valid) / len(weights) if weights else 0.0

    if valid_ratio < cfg.get("min_valid_axis_ratio", 0.5) or not valid:
        return CompositeScore(
            company_id=company_id,
            score=None,
            raw_weighted_average=None,
            lowest_axis=None,
            lowest_axis_score=None,
            valid_axis_ratio=valid_ratio,
            breakdown=breakdown,
        )

    # 유효 축만으로 가중치 재정규화 (결측 축이 있다고 점수가 자동으로 낮아지지 않게)
    valid_weight_sum = sum(weights[a] for a in valid)
    weighted_avg = sum(valid[a] * weights[a] for a in valid) / valid_weight_sum

    lowest_axis = min(valid, key=lambda a: valid[a])
    lowest_score = valid[lowest_axis]

    cap_margin = cfg.get("cap_margin", 15.0)
    final_score = min(weighted_avg, lowest_score + cap_margin)

    return CompositeScore(
        company_id=company_id,
        score=round(final_score, 1),
        raw_weighted_average=round(weighted_avg, 1),
        lowest_axis=lowest_axis,
        lowest_axis_score=round(lowest_score, 1),
        valid_axis_ratio=round(valid_ratio, 2),
        breakdown=breakdown,
    )


def compute_composite_scores_batch(
    axis_scores_by_id: dict[int, dict[str, float | None]],
    config: dict | None = None,
) -> dict[int, CompositeScore]:
    cfg = config or load_weights()
    return {
        cid: compute_composite_score(cid, scores, cfg)
        for cid, scores in axis_scores_by_id.items()
    }


# ============================================================
# 스모크 테스트
# ============================================================
if __name__ == "__main__":
    config = load_weights()
    weights = _resolve_axis_weights(config)
    print("[composite_score] 축별 최종 가중치:")
    for axis, w in weights.items():
        print(f"  {axis}: {w:.4f}")
    print(f"  합계: {sum(weights.values()):.4f}")

    # docs/재무축_설계노트.md §6 사례 재현: 2379 (수익성·안정성 최악, 효율성·성장성이 평균을 끌어올림)
    scenario_2379 = {
        "성장성": 68.0, "수익성": 8.0, "효율성": 71.0, "안정성": 6.0,
        "R&D특허": 55.0, "NTIS": 60.0, "정합성": 90.0,
    }
    # 대비군: 전 축 고르게 중간
    scenario_even = {
        "성장성": 45.0, "수익성": 45.0, "효율성": 45.0, "안정성": 45.0,
        "R&D특허": 45.0, "NTIS": 45.0, "정합성": 45.0,
    }

    for name, scores in [("2379 (축 어긋남 사례)", scenario_2379), ("가상 균등 45점", scenario_even)]:
        r = compute_composite_score(0, scores, config)
        print(f"\n=== {name} ===")
        print(f"  가중평균(캡 전): {r.raw_weighted_average}")
        print(f"  최저축: {r.lowest_axis} ({r.lowest_axis_score})")
        print(f"  종합점수(캡 후): {r.score}")

    # 결측 가드 테스트 — 유효 축 비율 미달
    sparse = {"성장성": 80.0, "수익성": None, "효율성": None, "안정성": None,
              "R&D특허": None, "NTIS": None, "정합성": None}
    r = compute_composite_score(0, sparse, config)
    print(f"\n=== 결측 다수 (유효축 1/7) ===")
    print(f"  valid_axis_ratio={r.valid_axis_ratio}  score={r.score} (None 기대)")

"""축8 사업정체성 정합성 서비스.

역할: 규칙기반 1단 필터(whitelist) 판정. LLM 2단 호출은 아직 미구현(결제 대기).

핵심 원칙 (docs/축8_설계노트.md 참조):
- **positive whitelist**: 관측 (KSIC 대분류, business_type) 조합 중 신뢰도 tier 통과분만 "정합 확정"
- **자기참조 편향 방어**: 관측 1~2건(low)은 whitelist 있어도 LLM 재확인 대상. 통계적 우연 가능성 배제
- **미통과 = 이상 아님**: 판단유보(undetermined) → LLM 2단 호출 대상
- 임계값·조합 하드코딩 없음 — 신뢰도 tier는 `axis8_thresholds.yaml`, whitelist는 `axis8_whitelist.csv`

반환 타입:
- AlignmentStatus 리터럴 — Company._mock: ["businessFit"] 실데이터 교체 지점(Phase 5)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import pandas as pd
import yaml

AlignmentStatus = Literal[
    "whitelisted",     # whitelist 통과 → 정합 확정
    "undetermined",    # 미통과 → LLM 2단 호출 필요
    "unknown_ksic",    # KSIC 대분류 추출 불가(5자리 숫자/결측) → LLM 대상
    "missing_input",   # business_type 결측 → 데이터 품질 이슈, LLM도 불가
]

_CONFIG_DIR = Path(__file__).resolve().parents[1] / "config"
CONFIG_PATH = _CONFIG_DIR / "axis8_whitelist.csv"
THRESHOLDS_PATH = _CONFIG_DIR / "axis8_thresholds.yaml"


@dataclass(frozen=True)
class AlignmentResult:
    status: AlignmentStatus
    score: float | None
    needs_llm: bool
    confidence: str | None = None   # "high"|"medium"|"low"|None
    matched_row: dict | None = None  # whitelist 매칭 원본(디버깅·근거)


@dataclass
class AlignmentSummary:
    total: int
    whitelisted: int
    undetermined: int
    unknown_ksic: int
    missing_input: int
    by_confidence: dict[str, int] = field(default_factory=dict)

    @property
    def llm_call_rate(self) -> float:
        """미통과·KSIC불명 비율 = LLM 호출 예상 비율 (비용 시뮬 근거)."""
        if self.total == 0:
            return 0.0
        return (self.undetermined + self.unknown_ksic) / self.total


def _ksic_major(code: object) -> str | None:
    """KSIC 11차 코드에서 대분류(첫 알파벳) 추출. 5자리 숫자·NULL → None."""
    if code is None or pd.isna(code):
        return None
    s = str(code).strip()
    return s[0] if s and s[0].isalpha() else None


def load_whitelist(path: Path | str | None = None) -> dict[tuple[str, str], dict]:
    """CSV → {(ksic_major, business_type): row_dict}. observed_sample 행만.

    reference_sheet_only 행(ksic_major null)은 판정에 쓸 조합이 아니라 카탈로그·본선 재확인용이므로 제외.
    """
    p = Path(path) if path else CONFIG_PATH
    if not p.exists():
        raise FileNotFoundError(f"whitelist 없음: {p} — build_axis8_whitelist.py 먼저 실행")
    df = pd.read_csv(p, comment="#")
    df = df[df["source"] == "observed_sample"]
    df = df.dropna(subset=["ksic_major", "business_type"])
    return {
        (str(r["ksic_major"]), str(r["business_type"])): r.to_dict()
        for _, r in df.iterrows()
    }


def load_accept_confidence(path: Path | str | None = None) -> set[str]:
    """whitelist 통과로 인정할 신뢰도 tier 집합 (axis8_thresholds.yaml)."""
    p = Path(path) if path else THRESHOLDS_PATH
    if not p.exists():
        raise FileNotFoundError(f"thresholds 없음: {p}")
    with p.open("r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    return set(cfg.get("accept_confidence", []))


def classify_alignment(
    ksic_code: object,
    business_type: object,
    whitelist: dict[tuple[str, str], dict],
    accept_confidence: set[str] | None = None,
) -> AlignmentResult:
    """단일 (기업 KSIC, 받은 사업유형) 조합 판정.

    - whitelist 통과 & 신뢰도 accept_confidence 포함 → score=100 확정
    - whitelist 통과 & 신뢰도 미포함(예: low) → 판단유보. 자기참조 편향 방어
    - 미통과 → 판단유보 (부정합 아님)
    - accept_confidence=None → 기본 tier config에서 로드
    """
    if business_type is None or pd.isna(business_type) or str(business_type).strip() == "":
        return AlignmentResult(status="missing_input", score=None, needs_llm=False)

    major = _ksic_major(ksic_code)
    bt = str(business_type).strip()

    if major is None:
        return AlignmentResult(status="unknown_ksic", score=None, needs_llm=True)

    accept = accept_confidence if accept_confidence is not None else load_accept_confidence()

    hit = whitelist.get((major, bt))
    if hit is not None:
        conf = hit.get("confidence")
        if conf in accept:
            return AlignmentResult(
                status="whitelisted",
                score=100.0,
                needs_llm=False,
                confidence=conf,
                matched_row=hit,
            )
        # 관측은 있지만 신뢰도 부족(low 등) → 자기참조 편향 방어
        return AlignmentResult(
            status="undetermined",
            score=None,
            needs_llm=True,
            confidence=conf,
            matched_row=hit,
        )
    return AlignmentResult(status="undetermined", score=None, needs_llm=True)


def summarize(results: list[AlignmentResult]) -> AlignmentSummary:
    """판정 결과 집계 — 비용 시뮬(Phase 3)의 llm_call_rate 산출용."""
    by_status = {"whitelisted": 0, "undetermined": 0, "unknown_ksic": 0, "missing_input": 0}
    by_conf: dict[str, int] = {}
    for r in results:
        by_status[r.status] += 1
        if r.confidence:
            by_conf[r.confidence] = by_conf.get(r.confidence, 0) + 1
    return AlignmentSummary(
        total=len(results),
        whitelisted=by_status["whitelisted"],
        undetermined=by_status["undetermined"],
        unknown_ksic=by_status["unknown_ksic"],
        missing_input=by_status["missing_input"],
        by_confidence=by_conf,
    )


if __name__ == "__main__":
    wl = load_whitelist()
    accept = load_accept_confidence()
    print(f"[axis8] whitelist 로드: {len(wl)}조합 · accept_confidence={sorted(accept)}")

    cases = [
        ("C29199", "패키지지원", "관측 32건 (high) → 통과"),
        ("Q86",    "사업화지원", "관측 11건 (high) → 통과"),
        ("C29199", "기반구축",   "관측 1건 (low) → 자기참조 방어 판단유보"),
        ("C29199", "RnD",       "미관측 → 판단유보"),
        ("42500",  "패키지지원", "5자리 숫자 → KSIC 불명"),
        ("C29199", None,         "business_type 결측"),
        (None,     "패키지지원", "KSIC 결측"),
    ]
    results = []
    for ksic, bt, note in cases:
        r = classify_alignment(ksic, bt, wl, accept)
        results.append(r)
        print(f"  {note!s:38s} → {r.status:15s} score={r.score} needs_llm={r.needs_llm} conf={r.confidence}")

    s = summarize(results)
    print(f"\n집계: whitelisted={s.whitelisted} undetermined={s.undetermined} "
          f"unknown_ksic={s.unknown_ksic} missing_input={s.missing_input}")
    print(f"LLM 호출 예상 비율: {s.llm_call_rate:.1%}")

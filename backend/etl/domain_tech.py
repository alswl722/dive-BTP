"""기술 도메인 식별 (축4-1) — "얼마나"가 아니라 "어느 분야에서".

기존 기술력 축(R&D·특허·NTIS)은 전부 **강도**만 측정한다. 심사자가
"이 기업이 우리 사업 분야에 맞나"를 판단하려면 **기술분야(도메인)** 가 필요하다.

소스: NTIS 주관의 `과학기술표준분류명`(= 국가과학기술표준분류체계, 정부 공식 taxonomy).
      샘플 기준 결측 1.8%(3/170), 고유 31종으로 품질 양호.
      `주관부처명`은 보조 도메인 신호(정책 영역).

산출:
  주력기술분야 / 기술분야_목록 / 기술분야_수 / 기술집중도(HHI)
  BTP중점사업 (부산TP 4대 중점사업 정렬)
  주력부처 / 부처다양성
  도메인_출처 (표준분류 | KSIC추정 | 미상)

⚠️ 3단 폴백: NTIS 과제가 없는 기업은 표준분류가 없다(샘플 11곳 중 2곳).
   NTIS 표준분류 → KSIC 업종 추정 → "기술분야 미상". **임의 추정 금지**,
   추정으로 채운 경우 `도메인_출처`에 반드시 표기해 화면에서 구분 가능하게 한다.

매핑 규칙은 `config/tech_domain.yaml`로 분리(CLAUDE.md 원칙3) — 본선에서
분류명이 달라지면 yaml만 수정.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import yaml

from aggregate_tech import KEY, _dedup_lead

CONFIG_PATH = Path(__file__).resolve().parent / "config" / "tech_domain.yaml"


def load_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _match_keywords(text: str, mapping: dict[str, list[str]]) -> list[str]:
    """text에 키워드가 포함되는 그룹명을 모두 반환(부분일치)."""
    if not text:
        return []
    hits = []
    for group, keywords in mapping.items():
        if any(kw in text for kw in keywords):
            hits.append(group)
    return hits


def _hhi(counts: list[int]) -> float:
    """허핀달 집중도(0~1). 1=한 분야 집중, 낮을수록 다각화."""
    total = sum(counts)
    if total <= 0:
        return float("nan")
    return sum((c / total) ** 2 for c in counts)


def build(tables: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """정규화 테이블 dict → 기업별 기술 도메인 DataFrame."""
    cfg = load_config()
    rollup = cfg["domain_rollup"]
    focus_map = cfg["btp_focus"]
    ksic_fb = cfg["ksic_fallback"]
    unknown = cfg["unknown_label"]

    comp = tables["companies"].set_index(KEY)
    lead = _dedup_lead(tables["ntis_lead_projects"])  # 스냅샷 중복 제거 후 과제 단위

    rows = []
    for cid in comp.index:
        g = lead[lead[KEY] == cid]
        cls = g["tech_classification"].dropna().tolist()

        # --- 1단: NTIS 표준분류 ---
        if cls:
            domains: list[str] = []
            for c in cls:
                domains.extend(_match_keywords(str(c), rollup))
            dom_counts = pd.Series(domains).value_counts() if domains else pd.Series(dtype=int)
            주력 = dom_counts.index[0] if len(dom_counts) else unknown
            출처 = "표준분류"
            분야목록 = sorted(set(cls))
            # BTP 4대 축: 원 분류명 텍스트로 매칭(롤업 손실 방지)
            focus: list[str] = []
            for c in cls:
                focus.extend(_match_keywords(str(c), focus_map))
            focus = sorted(set(focus))
            # 집중도: 소분류 기준
            집중도 = _hhi(pd.Series(cls).value_counts().tolist())
        else:
            # --- 2단: KSIC 업종 추정 ---
            ksic = str(comp.at[cid, "ksic_code"] or "")
            주력 = ksic_fb.get(ksic[:3], unknown)
            출처 = "KSIC추정" if 주력 != unknown else "미상"
            분야목록 = []
            focus = _match_keywords(주력, focus_map) if 주력 != unknown else []
            집중도 = float("nan")

        ministries = g["ministry"].dropna()
        rows.append({
            KEY: cid,
            "주력기술분야": 주력,
            "도메인_출처": 출처,
            "기술분야_수": len(분야목록),
            "기술집중도": round(집중도, 3) if pd.notna(집중도) else None,
            "기술분야_목록": "; ".join(분야목록) if 분야목록 else None,
            "BTP중점사업": "; ".join(focus) if focus else None,
            "주력부처": ministries.value_counts().index[0] if len(ministries) else None,
            "부처다양성": ministries.nunique(),
        })

    return pd.DataFrame(rows)


def main() -> None:
    from dev_loader import load_tables

    df = build(load_tables())
    pd.set_option("display.width", 250, "display.max_colwidth", 60)
    print(f"기술 도메인: shape={df.shape}\n")
    print(df[[KEY, "주력기술분야", "도메인_출처", "기술분야_수", "기술집중도",
              "BTP중점사업", "주력부처"]].to_string(index=False))

    print("\n[도메인 출처 분포]")
    print(df["도메인_출처"].value_counts().to_string())
    print("\n[주력 기술분야 분포]")
    print(df["주력기술분야"].value_counts().to_string())
    print("\n[BTP 4대 중점사업 정렬]")
    focus_counts: dict[str, int] = {}
    for v in df["BTP중점사업"].dropna():
        for f in v.split("; "):
            focus_counts[f] = focus_counts.get(f, 0) + 1
    for k, v in sorted(focus_counts.items(), key=lambda x: -x[1]):
        print(f"  {k}: {v}곳")


if __name__ == "__main__":
    main()

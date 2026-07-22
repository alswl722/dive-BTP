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
  지역전략산업 / 지역전략산업_매칭유형(고유|공통) / 지역전략산업_부합
    (부산시 제6차 전략산업 KSIC코드, config/external/busan_strategic_industry.yaml —
     NTIS 유무와 무관하게 KSIC만 있으면 전 기업 대상. 고유코드 매칭이 공통코드보다
     우선하는 강/약 신호 분리는 regional_fit() 참고. 미매칭은 "전략산업 아님"이라는
     사실이지 결측이 아니므로 지역전략산업_부합=False로 명시, NaN 아님)

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

CONFIG_DIR = Path(__file__).resolve().parent / "config"
CONFIG_PATH = CONFIG_DIR / "tech_domain.yaml"
EXTERNAL_DIR = CONFIG_DIR / "external"


def load_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_external(name: str) -> dict:
    """외부 데이터 참조표 로드 (config/external/). 없으면 빈 dict."""
    path = EXTERNAL_DIR / f"{name}.yaml"
    if not path.exists():
        print(f"  ⚠️ 외부 참조표 없음: {path.name} — 해당 지표 생략")
        return {}
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def regional_fit(ksic: str, table: dict) -> tuple[str | None, str | None]:
    """KSIC 코드(세세분류, 5자리+대분류) → 부산 지역전략산업 매칭.

    (config/external/busan_strategic_industry.yaml 참고)
    unique(고유) 코드 매칭을 common(공통) 코드보다 우선한다 — 공통 코드는 여러
    산업에 걸쳐있어 단독으로 특정 산업 소속을 단정할 근거가 약하다(강/약 신호 분리).
    반환: (지역전략산업명 또는 None, 매칭유형 "고유"|"공통" 또는 None)
    """
    if not table or not ksic:
        return None, None
    code = str(ksic).strip().upper()
    industries = table.get("strategic_industries") or {}
    for ind, groups in industries.items():
        if code in (groups.get("unique") or {}):
            return ind, "고유"
    for ind, groups in industries.items():
        if code in (groups.get("common") or {}):
            return ind, "공통"
    return None, None


def tech_intensity(ksic: str, table: dict) -> str | None:
    """KSIC 코드 → 기술수준 등급(OECD 기준). 제조업 외는 지식기반서비스 여부로.

    소분류 예외(항공기 등)를 중분류 등급보다 우선 적용한다.
    """
    if not table or not ksic:
        return None
    code = str(ksic).strip().upper()
    for prefix, level in (table.get("exceptions") or {}).items():
        if code.startswith(prefix):
            return level
    mid = code[:3]
    for level, codes in (table.get("levels") or {}).items():
        if mid in codes:
            return level
    if mid in (table.get("knowledge_intensive_services") or []):
        return "지식기반서비스"
    return table.get("unknown_label")


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

    # --- 외부 참조표 ---
    strat_map = (load_external("national_strategic_tech") or {}).get("strategic_tech", {})
    intensity_tbl = load_external("tech_intensity_ksic")
    regional_tbl = load_external("busan_strategic_industry")

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

        # --- 외부 데이터 ① 12대 국가전략기술 부합 (NTIS 분류명 기준, 보수적 매칭) ---
        strat: list[str] = []
        for c in cls:
            strat.extend(_match_keywords(str(c), strat_map))
        strat = sorted(set(strat))

        # --- 외부 데이터 ② 기술수준 등급 (KSIC → OECD 기술집약도) ---
        # 표준분류가 없는 기업도 업종만 있으면 나오므로 폴백 역할을 한다.
        등급 = tech_intensity(str(comp.at[cid, "ksic_code"] or ""), intensity_tbl)

        # --- 외부 데이터 ③ 부산 지역전략산업 매칭 (KSIC → 9대 전략산업) ---
        # 마찬가지로 KSIC만 있으면 되므로 NTIS 유무와 무관하게 전 기업에 적용된다.
        지역산업, 지역매칭유형 = regional_fit(str(comp.at[cid, "ksic_code"] or ""), regional_tbl)

        ministries = g["ministry"].dropna()
        rows.append({
            KEY: cid,
            "주력기술분야": 주력,
            "도메인_출처": 출처,
            "기술분야_수": len(분야목록),
            "기술집중도": round(집중도, 3) if pd.notna(집중도) else None,
            "기술분야_목록": "; ".join(분야목록) if 분야목록 else None,
            "BTP중점사업": "; ".join(focus) if focus else None,
            "국가전략기술": "; ".join(strat) if strat else None,
            "국가전략기술_부합": bool(strat),
            "기술수준등급": 등급,
            "지역전략산업": 지역산업,
            "지역전략산업_매칭유형": 지역매칭유형,
            "지역전략산업_부합": 지역산업 is not None,
            "주력부처": ministries.value_counts().index[0] if len(ministries) else None,
            "부처다양성": ministries.nunique(),
        })

    return pd.DataFrame(rows)


def main() -> None:
    from dev_loader import load_tables

    df = build(load_tables())
    pd.set_option("display.width", 250, "display.max_colwidth", 60)
    print(f"기술 도메인: shape={df.shape}\n")
    print(df[[KEY, "주력기술분야", "도메인_출처", "기술수준등급",
              "국가전략기술", "BTP중점사업"]].to_string(index=False))

    print("\n[도메인 출처 분포]")
    print(df["도메인_출처"].value_counts().to_string())
    print("\n[기술수준 등급 분포] (외부: OECD 기술집약도 × KSIC)")
    print(df["기술수준등급"].value_counts(dropna=False).to_string())
    print("\n[12대 국가전략기술 부합] (외부: 국가전략기술육성특별법)")
    print(f"  부합 {int(df['국가전략기술_부합'].sum())}곳 / 전체 {len(df)}곳")
    strat_counts: dict[str, int] = {}
    for v in df["국가전략기술"].dropna():
        for s in v.split("; "):
            strat_counts[s] = strat_counts.get(s, 0) + 1
    for k, v in sorted(strat_counts.items(), key=lambda x: -x[1]):
        print(f"  {k}: {v}곳")
    print("\n[BTP 4대 중점사업 정렬]")
    focus_counts: dict[str, int] = {}
    for v in df["BTP중점사업"].dropna():
        for f in v.split("; "):
            focus_counts[f] = focus_counts.get(f, 0) + 1
    for k, v in sorted(focus_counts.items(), key=lambda x: -x[1]):
        print(f"  {k}: {v}곳")
    print("\n[부산 9대 지역전략산업 부합] (외부: 부산시 제6차 전략산업 KSIC코드)")
    print(f"  부합 {int(df['지역전략산업_부합'].sum())}곳 / 전체 {len(df)}곳")
    print(df.loc[df["지역전략산업_부합"], "지역전략산업"].value_counts().to_string())
    print(df["지역전략산업_매칭유형"].value_counts(dropna=False).to_string())


if __name__ == "__main__":
    main()

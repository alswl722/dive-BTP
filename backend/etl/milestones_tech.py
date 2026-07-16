"""기술력 축 마일스톤 이벤트 추출 (성공경로 인터페이스).

기술력 데이터(연구조직 등록일·특허 출원/등록일·NTIS 수주연도)에서 기업의
성장 마일스톤을 **시점이 찍힌 이벤트**로 뽑는다. 성공경로 분석(유사기업 궤적,
다음 스텝 추천)의 시간축 재료가 된다 — 설계노트의 '성공 = 전이' 정의에서
전이 직전에 밟는 디딤돌(마일스톤)이 여기서 나온다.

출력: long 형식 (company_id, event_type, event_date, detail).
      한 기업이 여러 이벤트를 가지며, 없는 마일스톤은 행이 없음(임의값 대체 안 함).

마일스톤 종류:
  전담부서설치 / 부설연구소설립 / 첫특허출원 / 첫특허등록 / 국가R&D첫수주

날짜가 없는 기업(해당 마일스톤 미달성)은 그 이벤트 행을 만들지 않는다.
"""

from __future__ import annotations

import pandas as pd

from aggregate_tech import IP_TECH, KEY


def _to_ts(v) -> pd.Timestamp:
    return pd.to_datetime(v, errors="coerce")


def build(tables: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """정규화 테이블 dict → 마일스톤 이벤트 long DataFrame."""
    comp = tables["companies"]
    pat = tables["patents"]
    lead = tables["ntis_lead_projects"]
    events: list[dict] = []

    # --- 연구조직 (companies 등록일) ---
    for _, r in comp.iterrows():
        cid = r[KEY]
        if r.get("has_research_dept") and pd.notna(r.get("research_dept_registered_date")):
            events.append({KEY: cid, "event_type": "전담부서설치",
                           "event_date": _to_ts(r["research_dept_registered_date"]), "detail": None})
        if r.get("has_research_institute") and pd.notna(r.get("research_institute_registered_date")):
            events.append({KEY: cid, "event_type": "부설연구소설립",
                           "event_date": _to_ts(r["research_institute_registered_date"]), "detail": None})

    # --- 첫 특허 출원/등록 (기술 IP만) ---
    tech = pat[pat["ip_type"].isin(IP_TECH)].copy()
    tech["applied"] = _to_ts(tech["applied_date"])
    tech["registered"] = _to_ts(tech["registered_date"])
    for cid, g in tech.groupby(KEY):
        first_app = g["applied"].min()
        if pd.notna(first_app):
            events.append({KEY: cid, "event_type": "첫특허출원",
                           "event_date": first_app, "detail": None})
        first_reg = g["registered"].min()
        if pd.notna(first_reg):
            events.append({KEY: cid, "event_type": "첫특허등록",
                           "event_date": first_reg, "detail": None})

    # --- 국가 R&D 첫 수주 (NTIS 주관, 총연구기간 시작일 최소) ---
    lead = lead.copy()
    lead["start"] = _to_ts(lead["period_start_date"])
    for cid, g in lead.groupby(KEY):
        first = g["start"].min()
        if pd.notna(first):
            ministry = g.sort_values("start")["ministry"].dropna().iloc[0] if g["ministry"].notna().any() else None
            events.append({KEY: cid, "event_type": "국가R&D첫수주",
                           "event_date": first, "detail": ministry})

    out = pd.DataFrame(events)
    if out.empty:
        return out
    return out.sort_values([KEY, "event_date"]).reset_index(drop=True)


def main() -> None:
    from dev_loader import load_tables

    ev = build(load_tables())
    print(f"마일스톤 이벤트: {len(ev)}건 / {ev[KEY].nunique()}개 기업\n")
    with pd.option_context("display.width", 200, "display.max_rows", None):
        show = ev.copy()
        show["event_date"] = show["event_date"].dt.strftime("%Y-%m-%d")
        print(show.to_string(index=False))

    print("\n[검증] 2379 승격 경로 (전담부서→부설연구소 순서):")
    v = ev[ev[KEY] == 2379][["event_type", "event_date"]]
    v = v.assign(event_date=v["event_date"].dt.strftime("%Y-%m-%d"))
    print(v.to_string(index=False))


if __name__ == "__main__":
    main()

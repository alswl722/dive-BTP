"""기술력 축 엣지케이스 자체 테스트 (pytest 불필요 — python test_tech_edge_cases.py).

합성 원장으로 aggregate_tech / features_tech / scoring_tech / domain_tech의
방어 동작을 검증한다. docs/기술축_설계노트.md §2(데이터 특성 → 대응 결정)와 1:1 대응.

여기서 지키려는 것 = "그냥 집계하면 틀리는" 4가지가 다시 새어들지 않게 하는 것:
  1. 특허 원장에 상표권·디자인권 혼입 → 기술 IP만
  2. NTIS 주관 스냅샷 중복 → (기업, 총연구기간, 사업명) dedup
  3. 등록 vs 공개 혼동 → reg_status='등록'만
  4. 첫 특허가 설립보다 앞섬 → 업력 음수 0 clip
"""

from __future__ import annotations

import datetime as dt

import pandas as pd

import aggregate_tech
import domain_tech
import features_tech as ft
import scoring_tech as st

D = dt.date


def patent(cid, ip_type="특허권", status="등록", applied="2020-01-01",
           registered="2021-06-01", valid=True):
    return {
        "company_id": cid, "ip_type": ip_type, "reg_status": status,
        "applied_date": D.fromisoformat(applied),
        "registered_date": D.fromisoformat(registered) if registered else None,
        "relation_code": "본인", "is_valid": valid,
    }


def ntis_row(cid, name="사업A", start="2022-01-01", end="2022-12-31",
             base_year=2022, ministry="중소벤처기업부", funding=1e8, cls="유공압 부품"):
    return {
        "company_id": cid, "base_year": base_year, "base_date": D(base_year, 1, 1),
        "project_name": name, "ministry": ministry, "region": "부산",
        "period_start_date": D.fromisoformat(start), "period_end_date": D.fromisoformat(end),
        "current_period_start_date": D.fromisoformat(start),
        "current_period_end_date": D.fromisoformat(end),
        "tech_classification": cls, "gov_funding_krw": funding,
        "private_funding_krw": 0.0, "total_funding_krw": funding,
    }


def build_tables():
    """합성 테이블 6종. 기업별 시나리오는 아래 주석 참고."""
    companies = pd.DataFrame([
        # C1 정상(특허·NTIS 보유) / C2 설립 전 출원 / C3 인증만 보유(실체 없음)
        # C4 NTIS 없음(KSIC 폴백) / C5 원장에 아예 없음
        {"company_id": 1, "founded_date": D(2010, 1, 1), "ksic_code": "C29199"},
        {"company_id": 2, "founded_date": D(2018, 1, 1), "ksic_code": "C21309"},
        {"company_id": 3, "founded_date": D(2015, 1, 1), "ksic_code": "C25113"},
        {"company_id": 4, "founded_date": D(2012, 1, 1), "ksic_code": "C31114"},
        {"company_id": 5, "founded_date": D(2019, 1, 1), "ksic_code": "J58221"},
    ])

    patents = pd.DataFrame([
        # C1: 기술 IP 3건(등록 2 · 공개 1) + 비기술 IP 3건 ← 필터 대상
        patent(1, "특허권", "등록", "2015-01-01", "2016-01-01"),
        patent(1, "특허권", "등록", "2024-01-01", "2025-01-01", valid=False),  # 소멸
        patent(1, "특허권", "공개", "2024-06-01", None),
        patent(1, "상표권", "등록", "2015-01-01", "2016-01-01"),
        patent(1, "디자인권", "등록", "2015-01-01", "2016-01-01"),
        patent(1, "실용신안권", "등록", "2015-01-01", "2016-01-01"),  # 기술 IP에 포함
        # C2: 설립(2018)보다 앞선 출원 → 업력 음수 방어
        patent(2, "특허권", "등록", "2000-01-01", "2002-01-01"),
        # C3: 특허 전무(인증-실체 괴리 유도) — 상표권만 보유
        patent(3, "상표권", "등록", "2020-01-01", "2021-01-01"),
    ])

    ntis_lead = pd.DataFrame([
        # C1: 같은 과제가 스냅샷 3행으로 중복 → 1건으로 집계돼야 함
        ntis_row(1, "사업A", base_year=2022),
        ntis_row(1, "사업A", base_year=2023),
        ntis_row(1, "사업A", base_year=2024),
        # C1: 다른 과제 1건(부처 다름) → 과제수 2, 부처다양성 2
        ntis_row(1, "사업B", start="2023-01-01", end="2023-12-31",
                 base_year=2023, ministry="해양수산부", cls="해양오염방지기술"),
        # C2: 바이오 분야 1건
        ntis_row(2, "사업C", ministry="과학기술정보통신부", cls="바이오센서"),
    ])

    ntis_consigned = pd.DataFrame([
        {"company_id": 1, "base_year": 2022, "base_date": D(2022, 1, 1),
         "foreign_joint_research": False, "other_joint_research": False,
         "research_type": "공동연구(국내)", "joint_participation_type": "연구 기술개발",
         "joint_country": "대한민국", "research_entity_type": "중소기업",
         "consigned_funding_krw": 1e7, "joint_expense_krw": 0.0, "joint_income_krw": 0.0,
         "company_joint_research": True, "university_joint_research": True,
         "public_joint_research": False},
    ])

    certs = pd.DataFrame([
        {"company_id": c, "cert_type": t, "has_cert": v}
        for c, t, v in [
            (1, "이노비즈", True), (1, "벤처기업", True),
            (2, "벤처기업", True),
            (3, "이노비즈", True), (3, "메인비즈", True),  # 인증만 있고 실적 없음
            (4, "벤처기업", False), (5, "벤처기업", False),
        ]
    ])

    yearly = pd.DataFrame([
        {"company_id": c, "year": y,
         "revenue_thousand_krw": 1000.0 if c != 5 else 0.0,   # C5 매출 0 → 집약도 NaN
         "rnd_expense_thousand_krw": 100.0}
        for c in [1, 2, 3, 4, 5] for y in [2020, 2021, 2022, 2023, 2024]
    ])

    return {
        "companies": companies, "patents": patents,
        "ntis_lead_projects": ntis_lead, "ntis_consigned_projects": ntis_consigned,
        "company_certifications": certs, "company_yearly_metrics": yearly,
    }


def main():
    ok = 0

    def check(name, cond):
        nonlocal ok
        assert cond, f"❌ {name}"
        ok += 1
        print(f"  ✅ {name}")

    tables = build_tables()
    agg = aggregate_tech.build(tables).set_index("company_id")

    def a(cid, col):
        return agg.at[cid, col]

    # ---------- 함정 1: 상표·디자인 혼입 ----------
    print("[1] 특허 — 기술 IP만 집계 (상표·디자인 제외)")
    check("C1 출원 6건 중 기술 IP 4건만 집계", a(1, "특허출원_건수") == 4)
    check("C1 등록은 기술 IP 중 등록만 3건", a(1, "특허등록_건수") == 3)
    check("C3 상표권만 보유 → 기술 특허 0건", a(3, "특허출원_건수") == 0)

    # ---------- 함정 3: 등록 vs 공개 ----------
    print("[2] 특허 — 등록/공개 구분")
    check("C1 공개(계류) 1건은 등록에 미포함", a(1, "특허등록_건수") == 3)
    check("C1 소멸 특허 1건 집계", a(1, "특허소멸_건수") == 1)
    check("C1 유효 등록 2건", a(1, "특허유효등록_건수") == 2)

    # ---------- 함정 2: NTIS 스냅샷 중복 ----------
    print("[3] NTIS — 스냅샷 중복 제거")
    check("C1 원본 4행 → 고유 과제 2건", a(1, "NTIS주관_과제수") == 2)
    check("C1 부처다양성 2개", a(1, "NTIS주관_부처다양성") == 2)
    check("C1 위탁 산학협력 True", bool(a(1, "산학협력_여부")) is True)

    # ---------- 원장에 없는 기업 ----------
    print("[4] 원장에 없는 기업 방어")
    check("C5 특허 0건 (결측 아님)", a(5, "특허출원_건수") == 0)
    check("C4 NTIS 0건", a(4, "NTIS주관_과제수") == 0)
    check("전체 기업 수 유지 (원장에 없어도 행 존재)", len(agg) == 5)

    # ---------- features ----------
    print("[5] features — 비율·활동성 방어")
    feat = ft.compute_features(agg.reset_index(), tables["company_yearly_metrics"],
                               tables["companies"], verbose=False).set_index("company_id")

    def f(cid, col):
        return feat.at[cid, col]

    check("C1 등록전환율 = 3/4", abs(f(1, "특허등록전환율") - 0.75) < 1e-9)
    check("C3 출원 0 → 전환율 NaN (0나눗셈 방어)", pd.isna(f(3, "특허등록전환율")))
    check("C2 설립 전 출원 → 업력 음수 0으로 clip", f(2, "첫특허_업력") == 0)
    check("C5 매출 0 → R&D집약도 NaN", pd.isna(f(5, "R&D집약도")))
    check("C1 소멸률 = 1/3", abs(f(1, "특허소멸률") - 1 / 3) < 1e-9)

    # ---------- 인증-실체 괴리 ----------
    print("[6] 인증-실체 괴리 플래그")
    check("C3 핵심인증 보유 + 등록특허 0 + NTIS 0 → 괴리 True", bool(f(3, "인증실체괴리_플래그")) is True)
    check("C1 인증 있고 실적도 있음 → 괴리 False", bool(f(1, "인증실체괴리_플래그")) is False)
    check("C4 핵심인증 없음 → 괴리 False (인증 없으면 괴리 아님)", bool(f(4, "인증실체괴리_플래그")) is False)

    # ---------- scoring ----------
    print("[7] scoring — 백분위·방향")
    scores = st.compute_scores(feat.reset_index(), st._align_ksic(feat.reset_index(), tables["companies"]))
    scores = scores.set_index("company_id")
    check("축 점수 2개 산출", {"R&D특허점수", "NTIS점수"} <= set(scores.columns))
    check("업종 표본 부족 → 전체 fallback 표기", (scores["백분위기준"] == "전체fallback").all())
    check("C1(특허·NTIS 최다)이 NTIS 점수 최상위",
          scores["NTIS점수"].idxmax() == 1)
    check("괴리 플래그는 점수 미반영·passthrough 유지", "인증실체괴리_플래그" in scores.columns)

    # ---------- domain ----------
    print("[8] domain — 기술분야·폴백·외부 참조표")
    dom = domain_tech.build(tables).set_index("company_id")

    def d(cid, col):
        return dom.at[cid, col]

    check("C1 NTIS 표준분류 기반 판정", d(1, "도메인_출처") == "표준분류")
    check("C4 NTIS 없음 → KSIC 추정 폴백", d(4, "도메인_출처") == "KSIC추정")
    check("C4 KSIC C31 → 해양·수산", d(4, "주력기술분야") == "해양·수산")
    check("C2 바이오센서 → 국가전략기술 첨단바이오 매핑",
          "첨단바이오" in (d(2, "국가전략기술") or ""))
    check("C1 해양 분류 → 우주항공·해양 매핑",
          "우주항공·해양" in (d(1, "국가전략기술") or ""))
    check("C2 KSIC C21(의약품) → 고위기술", d(2, "기술수준등급") == "고위기술")
    check("C5 KSIC J58(SW) → 지식기반서비스", d(5, "기술수준등급") == "지식기반서비스")
    check("C1 복수 분야 → 집중도 1 미만(다각화)", d(1, "기술집중도") < 1.0)

    # 부산 9대 지역전략산업 매칭 (KSIC 기준, config/external/busan_strategic_industry.yaml)
    check("C1 KSIC C29199 → 융합부품소재(고유) 매칭",
          d(1, "지역전략산업") == "융합부품소재" and d(1, "지역전략산업_매칭유형") == "고유")
    check("C2 KSIC C21309 → 바이오헬스(고유) 매칭", d(2, "지역전략산업") == "바이오헬스")
    check("C4 KSIC C31114 → 미래모빌리티(고유) 매칭", d(4, "지역전략산업") == "미래모빌리티")
    check("C5 KSIC J58221 → 디지털테크(고유) 매칭", d(5, "지역전략산업") == "디지털테크")
    check("C3 KSIC C25113(9대 산업 코드에 없음) → 미부합(False, NaN 아님)",
          bool(d(3, "지역전략산업_부합")) is False and pd.notna(d(3, "지역전략산업_부합")))

    print(f"\n✅ 기술축 엣지케이스 {ok}건 통과")


if __name__ == "__main__":
    main()

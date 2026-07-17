"""원장(특허·NTIS·인증) → 기업 1행 집계 (기술력 축 전처리).

재무 축(팀원 A)은 master_table이 이미 기업 1행 wide였지만, 기술력 축의 소스는
**기업당 다건인 원장**(patents, ntis_lead/consigned_projects)이다. 이 모듈은 그
원장들을 company_id 1행으로 접는다. features_tech.py의 입력이 된다.

여기서 막는 함정(설계노트 근거):
- 특허 원장에 상표권·디자인권이 섞여 있음 → 기술 IP(특허권·실용신안권)만 집계.
  안 걸면 상표 많은 기업이 기술기업으로 둔갑.
- 특허 '등록'은 reg_status='등록'(=registered_date 존재)만. '공개'는 출원 계류라 제외.
- NTIS 주관은 기준일자 스냅샷이라 한 과제가 여러 행(예: 170행→59과제).
  (company_id, 총연구기간, 사업명)으로 dedup. 안 하면 수주건수가 부풀려짐.
- NTIS 위탁은 사업명·연구기간 컬럼이 없어 주관과 같은 키로 dedup 불가 →
  서술 컬럼으로 dedup하고, 주 산출물은 건수가 아니라 산학협력 여부(boolean).

입력: dev_loader.load_tables() 또는 DB read_sql_table 결과 dict (동일 스키마).
출력: company_id 1행, 아래 집계 컬럼. 원장에 없는 기업도 0/None으로 포함.
"""

from __future__ import annotations

import pandas as pd

KEY = "company_id"  # 원장 테이블 조인키(영문). master_table의 '기업일련번호'와 값은 같고 이름만 다름.

# 기술 IP만 (상표권·디자인권 제외 — R&D 산출물이 아님)
IP_TECH = {"특허권", "실용신안권"}
# 핵심 인증 (인증-실체 괴리 판정 대상)
CERT_CORE = ["이노비즈", "메인비즈", "벤처기업"]
CERT_ALL = ["이노비즈", "메인비즈", "벤처기업", "소재부품", "NET", "NEP"]


def aggregate_patents(patents: pd.DataFrame) -> pd.DataFrame:
    """특허 원장 → 기업별 (출원/등록 건수, 첫 출원·등록일). 기술 IP만."""
    tech = patents[patents["ip_type"].isin(IP_TECH)].copy()
    g = tech.groupby(KEY)
    reg = tech[tech["reg_status"] == "등록"].groupby(KEY)
    out = pd.DataFrame({
        "특허출원_건수": g.size(),
        "특허등록_건수": reg.size(),
        "특허_첫출원일": g["applied_date"].min(),
        "특허_첫등록일": reg["registered_date"].min(),
    })
    return out


def _dedup_lead(lead: pd.DataFrame) -> pd.DataFrame:
    """NTIS 주관 스냅샷 중복 제거: 같은 (기업, 총연구기간, 사업명) = 한 과제."""
    return lead.drop_duplicates(
        subset=[KEY, "period_start_date", "period_end_date", "project_name"]
    )


def aggregate_ntis_lead(lead: pd.DataFrame) -> pd.DataFrame:
    """NTIS 주관 → 기업별 (과제수, 정부연구비합, 부처다양성, 첫 수주연도). dedup 후."""
    dd = _dedup_lead(lead)
    g = dd.groupby(KEY)
    out = pd.DataFrame({
        "NTIS주관_과제수": g.size(),
        "NTIS주관_정부연구비": g["gov_funding_krw"].sum(),  # 단위 원(재무는 천원 — 혼용 주의)
        "NTIS주관_부처다양성": g["ministry"].nunique(),
        "NTIS주관_첫수주연도": g["base_year"].min(),
    })
    return out


def aggregate_ntis_consigned(cons: pd.DataFrame) -> pd.DataFrame:
    """NTIS 위탁 → 기업별 (과제수, 산학협력 여부). 사업명 없어 서술컬럼으로 dedup."""
    subset = [c for c in [KEY, "research_type", "joint_participation_type",
                          "joint_country", "research_entity_type", "consigned_funding_krw"]
              if c in cons.columns]
    dd = cons.drop_duplicates(subset=subset)
    g = dd.groupby(KEY)
    out = pd.DataFrame({"NTIS위탁_과제수": g.size()})
    if "university_joint_research" in cons.columns:
        out["산학협력_여부"] = g["university_joint_research"].any()
    return out


def aggregate_certs(certs: pd.DataFrame) -> pd.DataFrame:
    """인증 long(company_id, cert_type, has_cert) → 기업별 wide boolean + 보유수."""
    wide = certs.pivot_table(
        index=KEY, columns="cert_type", values="has_cert", aggfunc="first"
    )
    wide = wide.reindex(columns=CERT_ALL)  # 6종 순서 고정, 없는 인증은 NaN
    out = pd.DataFrame(index=wide.index)
    for c in CERT_ALL:
        out[f"인증_{c}"] = wide[c].fillna(False).astype(bool)
    out["인증_보유수"] = out[[f"인증_{c}" for c in CERT_ALL]].sum(axis=1)
    out["인증_핵심보유"] = out[[f"인증_{c}" for c in CERT_CORE]].any(axis=1)
    return out


def build(tables: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """전체 기업(companies 기준) × 기술력 원장 집계. 원장에 없는 기업도 0/None 유지."""
    base = tables["companies"][[KEY]].drop_duplicates().set_index(KEY)

    parts = [
        aggregate_patents(tables["patents"]),
        aggregate_ntis_lead(tables["ntis_lead_projects"]),
        aggregate_ntis_consigned(tables["ntis_consigned_projects"]),
        aggregate_certs(tables["company_certifications"]),
    ]
    out = base
    for p in parts:
        out = out.join(p, how="left")

    # 건수류 결측 = 실제 0 (원장에 행이 없다 = 실적이 없다). 날짜·인증은 그대로.
    int_count_cols = ["특허출원_건수", "특허등록_건수", "NTIS주관_과제수",
                      "NTIS주관_부처다양성", "NTIS위탁_과제수"]
    for c in int_count_cols:
        if c in out.columns:
            out[c] = out[c].fillna(0).astype(int)
    if "NTIS주관_정부연구비" in out.columns:  # 금액(원)은 float 유지
        out["NTIS주관_정부연구비"] = out["NTIS주관_정부연구비"].fillna(0.0)
    for c in [f"인증_{x}" for x in CERT_ALL] + ["인증_핵심보유"]:
        if c in out.columns:
            out[c] = out[c].fillna(False).astype(bool)
    if "산학협력_여부" in out.columns:
        out["산학협력_여부"] = out["산학협력_여부"].fillna(False).astype(bool)
    if "인증_보유수" in out.columns:
        out["인증_보유수"] = out["인증_보유수"].fillna(0).astype(int)

    return out.reset_index()


if __name__ == "__main__":
    from dev_loader import load_tables

    t = load_tables()
    agg = build(t)
    pd.set_option("display.width", 200, "display.max_columns", None)
    print(f"기술력 집계: shape={agg.shape}\n")
    show = ["company_id", "특허출원_건수", "특허등록_건수", "특허_첫출원일",
            "NTIS주관_과제수", "NTIS주관_부처다양성", "NTIS위탁_과제수",
            "인증_보유수", "인증_핵심보유", "산학협력_여부"]
    print(agg[show].to_string(index=False))
    print("\n[검증] 특허 등록건수 합:", int(agg["특허등록_건수"].sum()),
          "(기술 IP만 — 상표·디자인 제외)")
    print("[검증] NTIS 주관 과제수 합:", int(agg["NTIS주관_과제수"].sum()),
          "(dedup 후 — 원본 170행)")

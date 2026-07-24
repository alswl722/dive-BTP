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


RECENT_YEARS = 3  # '최근 활동' 판정 창(년)


def aggregate_patents(patents: pd.DataFrame, as_of: pd.Timestamp | None = None) -> pd.DataFrame:
    """특허 원장 → 기업별 집계. 기술 IP만.

    산출:
      건수/시점 — 출원·등록 건수, 첫 출원·등록일, 최종 출원일
      활동성   — 최근 N년 출원 건수 (누적 건수로는 안 보이는 'R&D 정체' 판별)
      권리유지 — 유효 등록 / 소멸(등록됐으나 is_valid=False) 건수

    as_of: '최근'의 기준 시점. None이면 원장의 최종 출원일에서 유도한다.
           (연도를 하드코딩하지 않기 위함 — 본선 데이터 기간이 달라도 동작)
    """
    tech = patents[patents["ip_type"].isin(IP_TECH)].copy()
    tech["_applied"] = pd.to_datetime(tech["applied_date"], errors="coerce")

    if as_of is None:
        as_of = tech["_applied"].max()
    cutoff = as_of - pd.DateOffset(years=RECENT_YEARS) if pd.notna(as_of) else None

    g = tech.groupby(KEY)
    reg_rows = tech[tech["reg_status"] == "등록"]
    reg = reg_rows.groupby(KEY)

    out = pd.DataFrame({
        "특허출원_건수": g.size(),
        "특허등록_건수": reg.size(),
        "특허_첫출원일": g["applied_date"].min(),
        "특허_첫등록일": reg["registered_date"].min(),
        "특허_최종출원일": g["applied_date"].max(),
    })

    # 활동성: 최근 N년 내 출원 건수
    if cutoff is not None:
        recent = tech[tech["_applied"] >= cutoff]
        out[f"특허최근{RECENT_YEARS}년_출원건수"] = recent.groupby(KEY).size()
    else:
        out[f"특허최근{RECENT_YEARS}년_출원건수"] = 0

    # 권리유지: 등록 특허 중 유효/소멸 (연차료 미납 등으로 권리 소멸 = 자금압박·기술철수 신호)
    out["특허유효등록_건수"] = reg_rows[reg_rows["is_valid"] == True].groupby(KEY).size()  # noqa: E712
    out["특허소멸_건수"] = reg_rows[reg_rows["is_valid"] == False].groupby(KEY).size()  # noqa: E712

    # 권리 귀속: 등록 특허 중 대표이사·임원 '개인 명의' 건수.
    # 법인이 아닌 개인 자산이라 대표 이탈 시 회사에 남지 않는다 → 회사 IP로 세면 과대평가.
    # 점수(특허등록_건수)는 그대로 두고(직무발명 승계 여부를 알 수 없어 일괄 제외는 과함),
    # 비중이 높으면 화면에서 "IP가 대표 개인에 집중" 경고를 띄우기 위한 참고 지표.
    if "relation_code" in reg_rows.columns:
        indiv = reg_rows[reg_rows["relation_code"].isin(["대표이사", "임원"])]
        out["대표개인명의_등록특허_건수"] = indiv.groupby(KEY).size()
    else:
        out["대표개인명의_등록특허_건수"] = 0

    return out


def _dedup_lead(lead: pd.DataFrame) -> pd.DataFrame:
    """NTIS 주관 스냅샷 중복 제거: 같은 (기업, 총연구기간, 사업명) = 한 과제."""
    return lead.drop_duplicates(
        subset=[KEY, "period_start_date", "period_end_date", "project_name"]
    )


def aggregate_ntis_lead(lead: pd.DataFrame) -> pd.DataFrame:
    """NTIS 주관 → 기업별 집계. dedup 후.

    과제수·정부연구비·부처다양성·첫수주연도에 더해 심사자용 두 신호를 추가:
    - 민간부담률: 정부 과제에 회사가 자기 자본을 얼마나 매칭했나(민간÷연구비합계).
      '지원금만 받는' 기업과 '자기 돈도 넣는' 기업을 가른다 → 반복지원 정당성 판단.
    - 최근수주연도·진행중과제수: 정부 R&D가 '과거 실적'인지 '현재도 수행 중'인지.
      스냅샷 기준일(base_date)이 총연구기간 안에 드는 과제 = 진행중.
    """
    dd = _dedup_lead(lead)
    g = dd.groupby(KEY)
    # 부처다양성: 결측 부처명은 normalize_ministry가 "미상"(ministry_map.yaml missing_label)으로
    # 통일한다. 이는 실재하는 부처가 아니므로 distinct 집계에 넣으면 다양성이 +1 부풀려진다
    # (nunique는 NaN만 자동 제외하지 실문자열 "미상"은 센다). where로 "미상"→NaN 처리해 제외.
    ministry_real = dd["ministry"].where(dd["ministry"] != "미상")
    out = pd.DataFrame({
        "NTIS주관_과제수": g.size(),
        "NTIS주관_정부연구비": g["gov_funding_krw"].sum(),  # 단위 원(재무는 천원 — 혼용 주의)
        "NTIS주관_부처다양성": ministry_real.groupby(dd[KEY]).nunique(),
        "NTIS주관_첫수주연도": g["base_year"].min(),
    })
    if "private_funding_krw" in dd.columns:
        out["NTIS주관_민간연구비"] = g["private_funding_krw"].sum()
    # 민간부담률 = 민간 ÷ 연구비합계 (0~1). 총액 0이면 NaN(계산 불가).
    if {"private_funding_krw", "total_funding_krw"}.issubset(dd.columns):
        pri = g["private_funding_krw"].sum()
        tot = g["total_funding_krw"].sum()
        out["NTIS주관_민간부담률"] = (pri / tot).where(tot > 0)

    st = pd.to_datetime(dd["period_start_date"], errors="coerce")
    en = pd.to_datetime(dd["period_end_date"], errors="coerce")
    # 최근 수주연도 = 최신 총연구기간 시작연도(수주 시점 기준)
    out["NTIS주관_최근수주연도"] = st.dt.year.groupby(dd[KEY]).max()
    # 진행중 = 데이터 스냅샷 기준일이 총연구기간 안에 드는 과제 수
    ref = pd.to_datetime(lead["base_date"], errors="coerce").max()
    if pd.notna(ref):
        ongoing = (st <= ref) & (en >= ref)
        out["NTIS주관_진행중과제수"] = ongoing.groupby(dd[KEY]).sum()
    else:
        out["NTIS주관_진행중과제수"] = 0
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
    int_count_cols = ["특허출원_건수", "특허등록_건수", "대표개인명의_등록특허_건수", "NTIS주관_과제수",
                      "NTIS주관_부처다양성", "NTIS주관_진행중과제수", "NTIS위탁_과제수",
                      f"특허최근{RECENT_YEARS}년_출원건수", "특허유효등록_건수", "특허소멸_건수"]
    for c in int_count_cols:
        if c in out.columns:
            out[c] = out[c].fillna(0).astype(int)
    for c in ["NTIS주관_정부연구비", "NTIS주관_민간연구비"]:  # 금액(원)은 float 유지, 무실적=0
        if c in out.columns:
            out[c] = out[c].fillna(0.0)
    # 민간부담률·최근수주연도: 무실적(정부 R&D 없음)이면 NaN 유지 → company_view에서 None
    #   (0으로 채우면 "부담률 0% / 수주 0년"으로 오독됨)
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

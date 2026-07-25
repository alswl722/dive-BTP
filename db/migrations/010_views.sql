-- 축7(업력) + NTIS 통합 조회 뷰 + 데이터 품질 경고 + master_table(팀원 인터페이스)

-- ============================================================
-- 축7. 업력: 기준일을 파라미터화한 함수 (하드코딩 금지 원칙 — "현재 시점 기준"과
-- "선정일 기준" 둘 다 필요할 수 있어 컬럼이 아니라 함수로 제공)
-- ============================================================
CREATE OR REPLACE FUNCTION company_age(as_of DATE DEFAULT CURRENT_DATE)
RETURNS TABLE(company_id INTEGER, age_years NUMERIC) AS $$
    SELECT c.company_id,
           CASE WHEN c.founded_date IS NULL THEN NULL
                ELSE ROUND((as_of - c.founded_date) / 365.25, 2)
           END AS age_years
    FROM companies c;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION company_age(DATE) IS
'축7(업력). 설립연도 결측 기업은 NULL(임의값 대체 금지, 스코어카드에서 "정보없음" 표시).
 사용 예: SELECT * FROM company_age();               -- 현재 시점 기준
          SELECT * FROM company_age(''2023-01-01'');  -- 특정 선정일 기준';

CREATE OR REPLACE VIEW company_age_now AS
SELECT * FROM company_age(CURRENT_DATE);

-- ============================================================
-- NTIS 주관/위탁 통합 조회 뷰 (건수 집계 등 공용 용도. 상세 컬럼은 원본 테이블 참조)
-- ============================================================
CREATE OR REPLACE VIEW ntis_projects AS
SELECT '주관' AS role, company_id, base_year, base_date, total_funding_krw AS funding_krw
FROM ntis_lead_projects
UNION ALL
SELECT '위탁' AS role, company_id, base_year, base_date, consigned_funding_krw AS funding_krw
FROM ntis_consigned_projects;

-- ============================================================
-- 데이터 품질 경고 (전사관리자 총괄 대시보드 S-tier 기능의 입력)
-- ============================================================
CREATE OR REPLACE VIEW data_quality_flags AS
SELECT
    sr.id AS support_record_id,
    sr.company_id,
    sr.year,
    sr.program_code,
    ARRAY_REMOVE(ARRAY[
        CASE WHEN sr.support_amount_thousand_krw IS NULL THEN '지원금결측' END,
        CASE WHEN sr.start_date IS NULL THEN '시작일결측' END,
        CASE WHEN sr.end_date IS NULL THEN '종료일결측' END,
        CASE WHEN sr.industry_code_raw IS NULL THEN '업종코드결측' END,
        CASE WHEN sr.main_product_raw IS NULL THEN '주생산품결측' END,
        CASE WHEN sr.founded_year_raw IS NULL THEN '설립연도결측' END
    ], NULL) AS missing_fields
FROM support_records sr;

COMMENT ON VIEW data_quality_flags IS 'CLAUDE.md 알려진 이슈 #3(결측치) 기반 경고 목록. missing_fields가 빈 배열이 아닌 행만 대시보드에 노출.';

-- ============================================================
-- master_table: 팀원A(재무축)·프론트엔드가 이미 병합해 의존 중인 "기업 1행" 와이드 인터페이스.
-- finance_utils.py/features_finance.py/scoring_finance.py/export_fixtures.py가
-- --source db 모드에서 pd.read_sql_table("master_table", engine)으로 그대로 읽는다.
-- 컬럼명은 원본 KODATA 한글 컬럼명 + "_연도" 규칙을 그대로 따른다(팀원 코드 무변경 목표).
-- ============================================================
CREATE OR REPLACE VIEW master_table AS
SELECT
    c.company_id AS "기업일련번호",
    c.region AS "지역",
    c.founded_date AS "설립일자",
    c.corp_type AS "기업유형",
    c.company_size AS "기업규모",
    c.listing_type AS "기업공개",
    c.corp_form AS "기업형태",
    c.ksic_code AS "KSIC코드(11차)",
    c.industry_name AS "업종명(11차)",
    c.main_products AS "주요제품",
    c.company_status AS "기업상태",

    MAX(CASE WHEN ym.year = 2020 THEN ym.employee_count END) AS "종업원수_2020",
    MAX(CASE WHEN ym.year = 2021 THEN ym.employee_count END) AS "종업원수_2021",
    MAX(CASE WHEN ym.year = 2022 THEN ym.employee_count END) AS "종업원수_2022",
    MAX(CASE WHEN ym.year = 2023 THEN ym.employee_count END) AS "종업원수_2023",
    MAX(CASE WHEN ym.year = 2024 THEN ym.employee_count END) AS "종업원수_2024",
    MAX(CASE WHEN ym.year = 2020 THEN ym.avg_annual_salary_krw END) AS "1인평균연간급여_2020",
    MAX(CASE WHEN ym.year = 2021 THEN ym.avg_annual_salary_krw END) AS "1인평균연간급여_2021",
    MAX(CASE WHEN ym.year = 2022 THEN ym.avg_annual_salary_krw END) AS "1인평균연간급여_2022",
    MAX(CASE WHEN ym.year = 2023 THEN ym.avg_annual_salary_krw END) AS "1인평균연간급여_2023",
    MAX(CASE WHEN ym.year = 2024 THEN ym.avg_annual_salary_krw END) AS "1인평균연간급여_2024",
    MAX(CASE WHEN ym.year = 2020 THEN ym.revenue_thousand_krw END) AS "매출액_2020",
    MAX(CASE WHEN ym.year = 2021 THEN ym.revenue_thousand_krw END) AS "매출액_2021",
    MAX(CASE WHEN ym.year = 2022 THEN ym.revenue_thousand_krw END) AS "매출액_2022",
    MAX(CASE WHEN ym.year = 2023 THEN ym.revenue_thousand_krw END) AS "매출액_2023",
    MAX(CASE WHEN ym.year = 2024 THEN ym.revenue_thousand_krw END) AS "매출액_2024",
    MAX(CASE WHEN ym.year = 2020 THEN ym.operating_profit_thousand_krw END) AS "영업이익손실_2020",
    MAX(CASE WHEN ym.year = 2021 THEN ym.operating_profit_thousand_krw END) AS "영업이익손실_2021",
    MAX(CASE WHEN ym.year = 2022 THEN ym.operating_profit_thousand_krw END) AS "영업이익손실_2022",
    MAX(CASE WHEN ym.year = 2023 THEN ym.operating_profit_thousand_krw END) AS "영업이익손실_2023",
    MAX(CASE WHEN ym.year = 2024 THEN ym.operating_profit_thousand_krw END) AS "영업이익손실_2024",
    MAX(CASE WHEN ym.year = 2020 THEN ym.cogs_thousand_krw END) AS "매출원가_2020",
    MAX(CASE WHEN ym.year = 2021 THEN ym.cogs_thousand_krw END) AS "매출원가_2021",
    MAX(CASE WHEN ym.year = 2022 THEN ym.cogs_thousand_krw END) AS "매출원가_2022",
    MAX(CASE WHEN ym.year = 2023 THEN ym.cogs_thousand_krw END) AS "매출원가_2023",
    MAX(CASE WHEN ym.year = 2024 THEN ym.cogs_thousand_krw END) AS "매출원가_2024",
    MAX(CASE WHEN ym.year = 2020 THEN ym.net_income_thousand_krw END) AS "당기순이익손실_2020",
    MAX(CASE WHEN ym.year = 2021 THEN ym.net_income_thousand_krw END) AS "당기순이익손실_2021",
    MAX(CASE WHEN ym.year = 2022 THEN ym.net_income_thousand_krw END) AS "당기순이익손실_2022",
    MAX(CASE WHEN ym.year = 2023 THEN ym.net_income_thousand_krw END) AS "당기순이익손실_2023",
    MAX(CASE WHEN ym.year = 2024 THEN ym.net_income_thousand_krw END) AS "당기순이익손실_2024",
    MAX(CASE WHEN ym.year = 2020 THEN ym.operating_margin_pct END) AS "영업이익률_2020",
    MAX(CASE WHEN ym.year = 2021 THEN ym.operating_margin_pct END) AS "영업이익률_2021",
    MAX(CASE WHEN ym.year = 2022 THEN ym.operating_margin_pct END) AS "영업이익률_2022",
    MAX(CASE WHEN ym.year = 2023 THEN ym.operating_margin_pct END) AS "영업이익률_2023",
    MAX(CASE WHEN ym.year = 2024 THEN ym.operating_margin_pct END) AS "영업이익률_2024",
    MAX(CASE WHEN ym.year = 2020 THEN ym.total_assets_thousand_krw END) AS "자산총계_2020",
    MAX(CASE WHEN ym.year = 2021 THEN ym.total_assets_thousand_krw END) AS "자산총계_2021",
    MAX(CASE WHEN ym.year = 2022 THEN ym.total_assets_thousand_krw END) AS "자산총계_2022",
    MAX(CASE WHEN ym.year = 2023 THEN ym.total_assets_thousand_krw END) AS "자산총계_2023",
    MAX(CASE WHEN ym.year = 2024 THEN ym.total_assets_thousand_krw END) AS "자산총계_2024",
    MAX(CASE WHEN ym.year = 2020 THEN ym.total_liabilities_thousand_krw END) AS "부채총계_2020",
    MAX(CASE WHEN ym.year = 2021 THEN ym.total_liabilities_thousand_krw END) AS "부채총계_2021",
    MAX(CASE WHEN ym.year = 2022 THEN ym.total_liabilities_thousand_krw END) AS "부채총계_2022",
    MAX(CASE WHEN ym.year = 2023 THEN ym.total_liabilities_thousand_krw END) AS "부채총계_2023",
    MAX(CASE WHEN ym.year = 2024 THEN ym.total_liabilities_thousand_krw END) AS "부채총계_2024",
    MAX(CASE WHEN ym.year = 2020 THEN ym.total_equity_thousand_krw END) AS "자본총계_2020",
    MAX(CASE WHEN ym.year = 2021 THEN ym.total_equity_thousand_krw END) AS "자본총계_2021",
    MAX(CASE WHEN ym.year = 2022 THEN ym.total_equity_thousand_krw END) AS "자본총계_2022",
    MAX(CASE WHEN ym.year = 2023 THEN ym.total_equity_thousand_krw END) AS "자본총계_2023",
    MAX(CASE WHEN ym.year = 2024 THEN ym.total_equity_thousand_krw END) AS "자본총계_2024",
    MAX(CASE WHEN ym.year = 2020 THEN ym.paid_in_capital_thousand_krw END) AS "납입자본금_2020",
    MAX(CASE WHEN ym.year = 2021 THEN ym.paid_in_capital_thousand_krw END) AS "납입자본금_2021",
    MAX(CASE WHEN ym.year = 2022 THEN ym.paid_in_capital_thousand_krw END) AS "납입자본금_2022",
    MAX(CASE WHEN ym.year = 2023 THEN ym.paid_in_capital_thousand_krw END) AS "납입자본금_2023",
    MAX(CASE WHEN ym.year = 2024 THEN ym.paid_in_capital_thousand_krw END) AS "납입자본금_2024",
    MAX(CASE WHEN ym.year = 2020 THEN ym.rnd_expense_thousand_krw END) AS "연구개발비_2020",
    MAX(CASE WHEN ym.year = 2021 THEN ym.rnd_expense_thousand_krw END) AS "연구개발비_2021",
    MAX(CASE WHEN ym.year = 2022 THEN ym.rnd_expense_thousand_krw END) AS "연구개발비_2022",
    MAX(CASE WHEN ym.year = 2023 THEN ym.rnd_expense_thousand_krw END) AS "연구개발비_2023",
    MAX(CASE WHEN ym.year = 2024 THEN ym.rnd_expense_thousand_krw END) AS "연구개발비_2024",
    MAX(CASE WHEN ym.year = 2020 THEN ym.patents_registered_cum END) AS "특허등록건수_2020",
    MAX(CASE WHEN ym.year = 2021 THEN ym.patents_registered_cum END) AS "특허등록건수_2021",
    MAX(CASE WHEN ym.year = 2022 THEN ym.patents_registered_cum END) AS "특허등록건수_2022",
    MAX(CASE WHEN ym.year = 2023 THEN ym.patents_registered_cum END) AS "특허등록건수_2023",
    MAX(CASE WHEN ym.year = 2024 THEN ym.patents_registered_cum END) AS "특허등록건수_2024",
    MAX(CASE WHEN ym.year = 2020 THEN ym.patents_applied_cum END) AS "특허출원건수_2020",
    MAX(CASE WHEN ym.year = 2021 THEN ym.patents_applied_cum END) AS "특허출원건수_2021",
    MAX(CASE WHEN ym.year = 2022 THEN ym.patents_applied_cum END) AS "특허출원건수_2022",
    MAX(CASE WHEN ym.year = 2023 THEN ym.patents_applied_cum END) AS "특허출원건수_2023",
    MAX(CASE WHEN ym.year = 2024 THEN ym.patents_applied_cum END) AS "특허출원건수_2024",

    BOOL_OR(CASE WHEN cert.cert_type = '이노비즈' THEN cert.has_cert END) AS "이노비즈",
    BOOL_OR(CASE WHEN cert.cert_type = '메인비즈' THEN cert.has_cert END) AS "메인비즈",
    BOOL_OR(CASE WHEN cert.cert_type = '벤처기업' THEN cert.has_cert END) AS "벤처기업",
    BOOL_OR(CASE WHEN cert.cert_type = '소재부품' THEN cert.has_cert END) AS "소재부품",
    BOOL_OR(CASE WHEN cert.cert_type = 'NET' THEN cert.has_cert END) AS "NET",
    BOOL_OR(CASE WHEN cert.cert_type = 'NEP' THEN cert.has_cert END) AS "NEP",

    ntis_lead.n AS "NTIS주관_행수",
    ntis_consigned.n AS "NTIS위탁_행수",
    sup.support_count AS "지원건수",
    sup.support_amount_sum AS "총지원금_천원",
    sup.support_years AS "지원연도수",

    -- 국민연금 가입(재직규모)·취업(신규취득)·퇴직(자격상실): 고용 회전율 파생 입력.
    -- features_finance가 find_year_cols("국민연금가입자수" 등)로 읽는다(컬럼명 스템 일치 필수).
    -- ⚠️ CREATE OR REPLACE VIEW는 컬럼을 끝에만 추가할 수 있어 SELECT 말미에 둔다(순서 무관 — 이름으로 소비).
    MAX(CASE WHEN ym.year = 2020 THEN ym.pension_subscribers END) AS "국민연금가입자수_2020",
    MAX(CASE WHEN ym.year = 2021 THEN ym.pension_subscribers END) AS "국민연금가입자수_2021",
    MAX(CASE WHEN ym.year = 2022 THEN ym.pension_subscribers END) AS "국민연금가입자수_2022",
    MAX(CASE WHEN ym.year = 2023 THEN ym.pension_subscribers END) AS "국민연금가입자수_2023",
    MAX(CASE WHEN ym.year = 2024 THEN ym.pension_subscribers END) AS "국민연금가입자수_2024",
    MAX(CASE WHEN ym.year = 2020 THEN ym.pension_employed END) AS "국민연금취업자수_2020",
    MAX(CASE WHEN ym.year = 2021 THEN ym.pension_employed END) AS "국민연금취업자수_2021",
    MAX(CASE WHEN ym.year = 2022 THEN ym.pension_employed END) AS "국민연금취업자수_2022",
    MAX(CASE WHEN ym.year = 2023 THEN ym.pension_employed END) AS "국민연금취업자수_2023",
    MAX(CASE WHEN ym.year = 2024 THEN ym.pension_employed END) AS "국민연금취업자수_2024",
    MAX(CASE WHEN ym.year = 2020 THEN ym.pension_retired END) AS "국민연금퇴직자수_2020",
    MAX(CASE WHEN ym.year = 2021 THEN ym.pension_retired END) AS "국민연금퇴직자수_2021",
    MAX(CASE WHEN ym.year = 2022 THEN ym.pension_retired END) AS "국민연금퇴직자수_2022",
    MAX(CASE WHEN ym.year = 2023 THEN ym.pension_retired END) AS "국민연금퇴직자수_2023",
    MAX(CASE WHEN ym.year = 2024 THEN ym.pension_retired END) AS "국민연금퇴직자수_2024",

    -- 선정건수 = 실제 "선정된 사업" 수(= DISTINCT (연도, 사업코드)).
    -- ⚠️ 지원건수(support_count)는 support_records의 **행 수**라 패키지지원의 세부품목
    --    (시제품제작+컨설팅+특허지원 …)이 각각 1건으로 잡힌다. 실제로는 한 사업에 한 번
    --    선정된 것이므로 반복·중복수혜 판정에 행 수를 쓰면 과대계상(false positive)된다.
    --    (샘플 실측: 1878은 3행이지만 선정은 B1_1_3 1건. 74개 조합 중 15건이 다행 패키지)
    -- → 화면 표시용 항목수는 지원건수, **반복/중복 판정은 선정건수**를 쓸 것.
    sup.selection_count AS "선정건수"

FROM companies c
LEFT JOIN company_yearly_metrics ym ON ym.company_id = c.company_id
LEFT JOIN company_certifications cert ON cert.company_id = c.company_id
LEFT JOIN (
    SELECT company_id, COUNT(*) AS n FROM ntis_lead_projects GROUP BY company_id
) ntis_lead ON ntis_lead.company_id = c.company_id
LEFT JOIN (
    SELECT company_id, COUNT(*) AS n FROM ntis_consigned_projects GROUP BY company_id
) ntis_consigned ON ntis_consigned.company_id = c.company_id
LEFT JOIN (
    SELECT company_id,
           COUNT(*) AS support_count,                             -- 행 수(= 지원 항목수, 패키지 세부품목 포함, 탈락·포기 포함)
           -- 선정건수: "반복선정"을 세는 값이므로 선정건(지원대상)만 + 패키지 분할 행 합산
           COUNT(DISTINCT (year, program_code)) FILTER (WHERE selection_result = '지원대상') AS selection_count,
           COALESCE(SUM(support_amount_thousand_krw), 0) AS support_amount_sum,
           COUNT(DISTINCT year) AS support_years
    FROM support_records
    GROUP BY company_id
) sup ON sup.company_id = c.company_id
GROUP BY c.company_id, c.region, c.founded_date, c.corp_type, c.company_size,
         c.listing_type, c.corp_form, c.ksic_code, c.industry_name, c.main_products,
         c.company_status, ntis_lead.n, ntis_consigned.n,
         sup.support_count, sup.selection_count, sup.support_amount_sum, sup.support_years;

COMMENT ON VIEW master_table IS
'팀원A(finance_utils/features_finance/scoring_finance)·프론트(export_fixtures)가 이미 의존 중인
 기업 1행 와이드 인터페이스. --source db 모드에서 pd.read_sql_table("master_table", engine)으로 그대로 읽힘.
 parquet 모드 개발용 파일은 build_master_table.py로 이 뷰를 backend/etl/data/master_table.parquet에 덤프.';

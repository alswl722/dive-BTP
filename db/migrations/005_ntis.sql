-- NTIS 연구이력 (KODATA '3-1. NTIS(주관)', '3-2. NTIS(위탁)' 시트)
-- 두 시트는 컬럼 구성이 크게 달라(주관=사업/부처/과제기간/연구비, 위탁=공동연구 형태/참여국가 등)
-- 억지로 한 테이블에 합치지 않고 role별 테이블 유지. 건수 집계 등 공용 조회는 ntis_projects 뷰(010) 사용.

CREATE TABLE IF NOT EXISTS ntis_lead_projects (   -- 주관 (TKP579)
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(company_id),
    base_year INTEGER,               -- 기준연도
    base_date DATE,                  -- 기준일자
    project_name TEXT,               -- 국가과학기술지식정보서비스사업명
    ministry TEXT,                   -- 주관부처명
    region TEXT,                     -- 지역구분명
    period_start_date DATE,          -- 총연구기간시작일자
    period_end_date DATE,            -- 총연구기간종료일자
    current_period_start_date DATE,  -- 당해연구기간시작일자
    current_period_end_date DATE,    -- 당해연구기간종료일자
    tech_classification TEXT,        -- 과학기술표준분류명
    gov_funding_krw NUMERIC,         -- 정부투자연구비 (단위=원)
    private_funding_krw NUMERIC,     -- 민간연구비합계
    total_funding_krw NUMERIC        -- 연구비합계
);
CREATE INDEX IF NOT EXISTS idx_ntis_lead_company ON ntis_lead_projects(company_id);

CREATE TABLE IF NOT EXISTS ntis_consigned_projects (   -- 위탁 (TKP580)
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(company_id),
    base_year INTEGER,
    base_date DATE,
    foreign_joint_research BOOLEAN,   -- 외국연구기관공동연구여부
    other_joint_research BOOLEAN,     -- 기타공동연구여부
    research_type TEXT,               -- 연구형태명
    joint_participation_type TEXT,    -- 공동연구참여형태명
    joint_country TEXT,               -- 공동연구참여국가명
    research_entity_type TEXT,        -- 연구수행주체명
    consigned_funding_krw NUMERIC,    -- 위탁과제연구비 (단위=원)
    joint_expense_krw NUMERIC,        -- 공동연구비지출금액
    joint_income_krw NUMERIC,         -- 공동연구비수입금액
    company_joint_research BOOLEAN,   -- 기업공동연구여부
    university_joint_research BOOLEAN,-- 대학공동연구여부
    public_joint_research BOOLEAN     -- 국공립공동연구여부
);
CREATE INDEX IF NOT EXISTS idx_ntis_consigned_company ON ntis_consigned_projects(company_id);

COMMENT ON TABLE ntis_lead_projects IS 'KODATA 3-1.NTIS(주관) — 정부 R&D 과제 주관 수행 이력. 기준일자별 스냅샷이라 한 연구가 여러 행일 수 있음(총연구기간 컬럼으로 식별).';
COMMENT ON TABLE ntis_consigned_projects IS 'KODATA 3-2.NTIS(위탁) — 공동/위탁연구 이력.';

-- 기업 기준 엔티티 (KODATA '1. 기업정보' 시트 중 연도 무관 정적 정보 + 인증/연구소 섹션)
-- PK: company_id = 기업일련번호. 다른 모든 시트가 이 값으로 조인된다.

CREATE TABLE IF NOT EXISTS companies (
    company_id INTEGER PRIMARY KEY,
    region TEXT,
    founded_date DATE,
    corp_type TEXT,                 -- 기업유형 (법인/개인)
    company_size TEXT,              -- 기업규모 (대/중/소)
    listing_type TEXT,              -- 기업공개 (코스피/코스닥)
    corp_form TEXT,                 -- 기업형태 (주식/개인)
    ksic_code TEXT,                 -- KSIC코드(11차) — 업종 그룹핑 기준 코드 (권장)
    industry_name TEXT,             -- 업종명(11차)
    main_products TEXT,
    is_closed BOOLEAN,              -- 휴폐업여부 (Y/N)
    closed_date DATE,
    inquiry_date DATE,
    closure_type TEXT,
    company_status TEXT,
    researcher_count_recent INTEGER,
    has_research_institute BOOLEAN,
    research_institute_registered_date DATE,
    has_research_dept BOOLEAN,
    research_dept_registered_date DATE
);

COMMENT ON TABLE companies IS 'KODATA 1.기업정보 시트 — 기업 개요(연도 무관 정적 정보) + 인증/연구소 섹션 일부. 기업일련번호는 시트1~5 공통 조인키.';
COMMENT ON COLUMN companies.ksic_code IS '업종코드 그룹핑은 이 컬럼(항상 11차 알파벳+숫자 포맷)을 권장. support_records.industry_code_raw(부산TP 자체 입력)는 연도/건별로 포맷이 섞여 있어 참고용.';

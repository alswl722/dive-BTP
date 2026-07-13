-- 부산TP 사업목록 / 기업지원목록 (2022~2024년 시트를 연도 컬럼으로 통합)

CREATE TABLE IF NOT EXISTS support_programs (
    year INTEGER NOT NULL,
    program_code TEXT NOT NULL,     -- 코드
    program_name TEXT,              -- 부산TP 예산서의 사업명
    macro_category TEXT,            -- 사업구분 (RnD/복합/기업지원)
    business_type TEXT,             -- 사업유형 (참조: ref_business_types.business_type)
    start_date DATE,
    end_date DATE,
    ministry TEXT,                  -- 부처명
    local_gov TEXT,                 -- 지자체
    description TEXT,               -- 주요내용
    PRIMARY KEY (year, program_code)
);

CREATE TABLE IF NOT EXISTS support_records (
    id SERIAL PRIMARY KEY,
    year INTEGER NOT NULL,
    program_code TEXT NOT NULL,
    company_id INTEGER NOT NULL REFERENCES companies(company_id),
    business_type TEXT,                        -- 사업유형
    support_detail_main TEXT,                  -- 지원구분(주요지원)
    support_detail_other TEXT,                 -- 지원구분(주요지원 외 작성 *패키지지원만)
    support_item TEXT,                         -- 지원품목
    selected_date DATE,                        -- 선정일
    selection_result TEXT,                     -- 선정결과: 지원대상 / 탈락 / 포기
    support_amount_thousand_krw NUMERIC,       -- 지원금(천원) — 결측은 NULL 유지, 집계 시에만 0 처리
    start_date DATE,
    end_date DATE,
    industry_code_raw TEXT,                    -- 업종코드 원본 (⚠️ 연도/건별 포맷 혼재, 정규화는 companies.ksic_code JOIN 권장)
    region_wide TEXT,                          -- 광역
    region_base TEXT,                          -- 기초
    main_product_raw TEXT,                     -- 주생산품 (신청 당시 스냅샷, companies.main_products와 다를 수 있음)
    founded_year_raw TEXT,                     -- 설립연도 (신청 당시 스냅샷, companies.founded_date와 다를 수 있음)
    FOREIGN KEY (year, program_code) REFERENCES support_programs(year, program_code)
);

CREATE INDEX IF NOT EXISTS idx_support_records_company ON support_records(company_id);
CREATE INDEX IF NOT EXISTS idx_support_records_program ON support_records(year, program_code);

COMMENT ON TABLE support_programs IS '부산TP 2022~2024_사업목록 시트 통합. PK(year, program_code) — 코드 체계가 연도마다 달라(2022~2023 A1_301식 / 2024 A2_1_1식) 코드 단독으로는 유일하지 않음.';
COMMENT ON TABLE support_records IS '부산TP 2022~2024_기업지원목록 시트 통합. 중복지원 탐지(GROUP BY company_id HAVING COUNT(*)>=N)와 반복선정 랭킹의 기본 원장.';
COMMENT ON COLUMN support_records.industry_code_raw IS '⚠️ 알려진 이슈: 같은 연도 시트 안에서도 5자리 숫자(예 42500)와 알파벳+숫자(예 C29199) 포맷이 섞여 있고, 일부는 코드가 아닌 텍스트(예 "제조업")도 존재. 업종 그룹핑에는 사용하지 말고 companies.ksic_code를 JOIN해서 사용할 것.';
COMMENT ON COLUMN support_records.support_amount_thousand_krw IS '결측 시 원본 NULL 유지(정책: 원본 보존). 총지원금 등 집계 지표를 낼 때만 COALESCE(...,0) 적용.';

-- 업종코드 정규화 매핑 (부산TP 지원목록의 업종코드 원본 → 정규화 코드)
-- 알고리즘으로 매핑 가능한 것(이미 11차 포맷)만 자동 채우고, 나머지는 raw 그대로 남긴다.
-- 실무 그룹핑은 이 테이블보다 companies.ksic_code(항상 신뢰 가능한 11차 포맷) JOIN을 우선 권장.

CREATE TABLE IF NOT EXISTS industry_code_map (
    raw_code TEXT PRIMARY KEY,
    normalized_code TEXT,          -- 11차 포맷(알파벳+숫자)으로 정규화된 값. 매핑 불가 시 NULL.
    mapping_status TEXT            -- 'already_normalized' | 'legacy_numeric_unmapped' | 'invalid'
);

COMMENT ON TABLE industry_code_map IS
'ETL이 support_records.industry_code_raw의 distinct 값을 스캔해 채운다.
 - already_normalized: 이미 [A-Z]+숫자 포맷(예 C29199) → 그대로 normalized_code
 - legacy_numeric_unmapped: 5자리 숫자만(예 42500, 10차 추정) → 10차→11차 공식 매핑표가 없어 normalized_code=NULL(수작업 필요)
 - invalid: 코드가 아닌 텍스트(예 "제조업") → normalized_code=NULL';

-- 지원구분 정규화 검증 리포트 (부산TP 기업지원목록의 지원구분 원본 → 참조표 대조 결과)
-- industry_code_map(009)과 동일 패턴: 알고리즘으로 판정 가능한 상태만 자동 채우고,
-- 실제 값 수정은 하지 않는다(원본 support_records는 불변, 이 테이블은 진단용).

CREATE TABLE IF NOT EXISTS support_type_check (
    business_type TEXT NOT NULL,   -- support_records.business_type (사업유형)
    support_detail TEXT NOT NULL,  -- support_records.support_detail_main 원본 값
    field TEXT NOT NULL,           -- 'main' | 'other' (어느 컬럼에서 나온 값인지)
    match_status TEXT NOT NULL,    -- 'matched' | 'unmatched_combo' | 'unmatched_business_type'
    record_count INTEGER NOT NULL, -- 해당 (business_type, support_detail, field) 조합의 support_records 건수
    PRIMARY KEY (business_type, support_detail, field)
);

COMMENT ON TABLE support_type_check IS
'ETL이 support_records.support_detail_main/other distinct 조합을 ref_support_types와 대조해 채운다.
 - matched: ref_support_types(business_type, support_type)에 정확히 존재
 - unmatched_combo: business_type은 ref_business_types에 있으나 이 조합은 ref_support_types에 없음(오탈자/신규 값 의심)
 - unmatched_business_type: business_type 자체가 ref_business_types에 없음
 값 자체를 고치지 않는다 — 심사 담당자/개발자가 원본 표기 차이를 판단할 수 있도록 남겨두는 진단 테이블.';

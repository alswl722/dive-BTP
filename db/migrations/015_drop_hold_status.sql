-- 심사 상태에서 '보류'를 없애고 후보/선정/제외 3종으로 단순화한다.
-- 기존에 '보류'로 저장된 행은 다시 '후보'(미결정)로 되돌린다 — 보류를 대체할 별도
-- 상태가 없으므로 가장 가까운 의미는 "아직 결정 안 됨"이다.

UPDATE company_program_review_status SET status = '후보' WHERE status = '보류';
UPDATE company_review_status SET status = '후보' WHERE status = '보류';

ALTER TABLE company_program_review_status DROP CONSTRAINT company_program_review_status_status_check;
ALTER TABLE company_program_review_status ADD CONSTRAINT company_program_review_status_status_check
    CHECK (status IN ('후보', '선정', '제외'));

ALTER TABLE company_review_status DROP CONSTRAINT company_review_status_status_check;
ALTER TABLE company_review_status ADD CONSTRAINT company_review_status_status_check
    CHECK (status IN ('후보', '선정', '제외'));

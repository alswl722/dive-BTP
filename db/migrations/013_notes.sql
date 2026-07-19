-- 심사 담당자 메모. 기업/사업을 @·# 로 멘션하면 양방향으로 연결된다.
--
-- 본문은 멘션을 인라인 마크업으로 품은 원문 그대로 저장한다:
--   @[기업 1049](company:1049)  ·  #[스마트공장 보급확산사업](program:2024:B1_1_3)
-- 표시명을 함께 넣어두면 대상이 사라져도 문장이 깨지지 않고,
-- 렌더링 시에는 id로 최신 이름을 다시 붙일 수 있다.
--
-- 역방향 조회("이 기업이 언급된 메모")를 본문 LIKE로 하면 느리고 부정확하므로
-- 저장 시 파싱해 note_mentions에 인덱스를 만든다.

CREATE TABLE IF NOT EXISTS notes (
    id         SERIAL PRIMARY KEY,
    body       TEXT NOT NULL,
    author     TEXT NOT NULL,   -- 작성 시점의 role 라벨. 인증 도입 시 user_id로 대체.
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS note_mentions (
    note_id      INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    target_type  TEXT    NOT NULL CHECK (target_type IN ('company', 'program')),
    -- company일 때만 사용
    company_id   INTEGER,
    -- program일 때만 사용 (support_programs 복합키)
    program_year INTEGER,
    program_code TEXT,
    CHECK (
        (target_type = 'company' AND company_id IS NOT NULL
                                 AND program_year IS NULL AND program_code IS NULL)
        OR
        (target_type = 'program' AND company_id IS NULL
                                 AND program_year IS NOT NULL AND program_code IS NOT NULL)
    )
);

-- 같은 메모에서 같은 대상을 여러 번 멘션해도 한 행만 남긴다(역방향 목록 중복 방지).
CREATE UNIQUE INDEX IF NOT EXISTS note_mentions_company_uq
    ON note_mentions (note_id, company_id) WHERE target_type = 'company';
CREATE UNIQUE INDEX IF NOT EXISTS note_mentions_program_uq
    ON note_mentions (note_id, program_year, program_code) WHERE target_type = 'program';

CREATE INDEX IF NOT EXISTS note_mentions_company_idx ON note_mentions (company_id);
CREATE INDEX IF NOT EXISTS note_mentions_program_idx ON note_mentions (program_year, program_code);

COMMENT ON TABLE notes IS
'심사 담당자 메모(독립 메모장). 본문에 @기업·#사업 멘션을 인라인 마크업으로 포함.';
COMMENT ON TABLE note_mentions IS
'메모 → 멘션 대상 인덱스. 기업/사업 상세의 "이 대상이 언급된 메모" 역방향 조회용.
 notes 저장 시 본문을 파싱해 재생성한다(app/services/notes.py).';

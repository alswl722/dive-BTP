-- 축8 LLM 시맨틱 판정 결과 캐시.
-- scripts/run_axis8_llm_batch.py가 whitelist 미통과 케이스에 대해 LLM(DeepSeek/OpenAI/Claude)
-- 호출 결과를 이 테이블에 저장. company_view.build_business_fit()이 판정 시 이 테이블을 조회해
-- pending → llm 상태로 승격한다.
--
-- purposes_hash = 사업목적 텍스트 정렬 후 SHA-256 앞 12자 (axis8_llm.hash_purposes)
-- → 등기부 사업목적이 갱신되면 자동으로 캐시 무효화(새 해시 → 새 판정 필요)

CREATE TABLE IF NOT EXISTS axis8_llm_cache (
    company_id INTEGER NOT NULL,
    program_code TEXT NOT NULL,
    purposes_hash TEXT NOT NULL,
    score INTEGER,
    match_type TEXT NOT NULL CHECK (match_type IN ('직접일치', '간접관련', '무관', '판단유보')),
    matched_keywords TEXT NOT NULL DEFAULT '[]',   -- JSON array 문자열
    reasoning TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (company_id, program_code, purposes_hash)
);

COMMENT ON TABLE axis8_llm_cache IS
'축8 LLM 판정 캐시 (deepseek-chat / gpt-4o-mini / claude-opus-4-7 등).
 scripts/run_axis8_llm_batch.py가 whitelist 미통과 (판단유보) 케이스에 대해 채운다.
 build_business_fit()이 조회해서 source=llm으로 승격.';

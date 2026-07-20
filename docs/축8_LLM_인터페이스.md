# 축8 LLM 인터페이스 설계 (DeepSeek 채택 · 실 호출 활성)

> 담당: 팀원 D (형우, 기술리드) · 관련 코드: `backend/app/services/axis8_llm.py`
> 상태: **DeepSeek 실 호출 활성화** (2026-07-16). Claude 결제 대기가 아니었던 이유·최종 결정은 `docs/축8_비용시뮬.md`.

---

## 1. 목적·범위

Phase 2 규칙기반 1단 필터에서 **판단유보(`undetermined`/`unknown_ksic`)** 로 분류된 조합만 LLM에 넘겨 시맨틱 정합성 판정을 받는다.

- **미호출**: `whitelisted`, `missing_input`
- **호출 대상**: `undetermined`, `unknown_ksic`
- **샘플 실측 호출율**: 92건 중 8건(8.7%). 본선 20~40% 가정

---

## 2. 프로바이더 · 모델

### 2.1 기본 선택 — DeepSeek V3 (`deepseek-chat`)

**채택 근거** (docs/축8_비용시뮬.md 요약):
- 파일럿 4건 정확도 4/4 (gpt-4o 동률, gpt-4o-mini 우위)
- 최저 비용 (5000기업 시나리오 $0.17, gpt-4o 대비 24배 저렴)
- 극단값 점수 분포 (85·15·50·10) → 심사 도구 UX에 유리

### 2.2 옵션 프로바이더

`AXIS8_LLM_PROVIDER` env로 스위칭 가능:

| 프로바이더 | env 값 | 모델 default | 상태 |
| --- | --- | --- | --- |
| **DeepSeek** | `deepseek` | `deepseek-chat` | ✅ 결제·활성 |
| OpenAI | `openai` | `gpt-4o` | ✅ 결제·활성 (옵션) |
| Claude | `claude` | `claude-opus-4-7` | 결제 미승인 (철회) |

**미지정 시 자동 감지 순서** (`axis8_llm._detect_provider`):
`deepseek` → `openai` → `claude` — 유효 API 키가 있는 첫 프로바이더 선택.

### 2.3 프로바이더별 호출 스타일

| 프로바이더 | SDK | Structured Output | 캐싱 | 재시도 |
| --- | --- | --- | --- | --- |
| DeepSeek | `openai` + `base_url` | JSON mode + Pydantic 수동 검증 | 자동 prefix 매칭 | 필요 (2회) |
| OpenAI | `openai` | `beta.chat.completions.parse()` — SDK 자동 매핑 | 자동 (1024+ 토큰) | 불필요 |
| Claude | `anthropic` | `messages.parse()` — SDK 자동 매핑 | 명시적 `cache_control` | 불필요 |

---

## 3. 프롬프트 설계

### 3.1 원칙 (프로바이더 무관)

- **시스템 프롬프트 고정** — 캐싱 prefix로 사용 (변경 금지)
- **기업 사업목적 재사용 캐시** — 기업당 write 1회 후 read
- **가변부 마지막** — 지원사업 정보는 캐시 뒤에 배치

### 3.2 시스템 프롬프트 (고정)

`axis8_llm.SYSTEM_PROMPT` 상수. 구조:
- `<role>` 부산TP 심사 담당자 지원 도구 assistant
- `<task>` 사업목적 vs 지원사업 정합성 0~100 판정, 어휘가 아닌 의미 매칭
- `<scoring_guide>` 71~100 직접일치 · 31~70 간접관련 · 0~30 무관
- `<output_rules>` 4개 필드 (score, match_type, matched_keywords, reasoning)
- `<caution>` 어휘 겹침 부재로 무관 판정 금지 등 3항목 (기업 1178 사례 인용)

### 3.3 User 메시지 (가변)

**블록1 (캐시 대상, `_build_business_purpose_block`)**:
```
<company id={company_id}>
<business_purposes>
  1. {purpose_1}
  ...
</business_purposes>
</company>
```

**블록2 (fresh, `_build_support_block`)**:
```
다음 지원사업과 위 사업목적의 정합성을 판정해줘.

<support_program>
  사업명: {program_name}
  business_type: {business_type}
  세부구분: {support_detail_main}
  설명: {description}
</support_program>
```

**DeepSeek JSON mode 추가 hint** (`JSON_SCHEMA_HINT`): 스키마 예시 명시하여 자유 텍스트 방지.

---

## 4. Structured Output 스키마

```python
class LLMAlignmentJudgment(BaseModel):
    score: int = Field(ge=0, le=100)
    match_type: Literal["직접일치", "간접관련", "무관"]
    matched_keywords: list[str] = Field(default_factory=list, max_length=3)
    reasoning: str
```

- **`matched_keywords`**: 담당자 화면 근거 표시 · 발표 "왜 이 점수?" 대응
- **`reasoning`**: 스코어카드 tooltip / 상세보기

DeepSeek는 JSON mode 응답 → `LLMAlignmentJudgment.model_validate()` 수동 검증. 실패 시 최대 2회 재시도.
OpenAI/Claude는 SDK가 자동 검증.

---

## 5. 캐싱 아키텍처 (2단)

### 5.1 앱 레벨 dedup 캐시 (LLM 호출 자체 제거)

- **키**: `(company_id, program_code, purposes_sha12)`
- **저장소**: in-memory dict (Phase 5b에서 SQLite/Redis로 승격 결정)
- **효과**: 같은 조합 재호출 시 LLM 호출 완전 스킵 → 비용·지연 0
- **예상 히트율**: 40%

### 5.2 프로바이더 prompt cache

**DeepSeek** — 자동 prefix 매칭:
- System prompt (~500t) + 기업 사업목적 (~200t) 자동 캐시
- Cache read 비용: 입력의 10% ($0.014 vs $0.14 per 1M)
- 스모크 테스트 실측: 3, 4번째 호출부터 384 tokens hit

**OpenAI** — 자동 캐싱 (1024+ tokens prefix, 50% 할인)
**Claude** — 명시적 `cache_control: {"type":"ephemeral"}`

---

## 6. 호출 흐름 (End-to-End)

```
[Phase 2 axis8.classify_alignment]
     │
     ├── whitelisted     → score=100 확정, return  ─┐
     ├── missing_input   → score=None, return       ├─→ Company._mock 교체
     ├── unknown_ksic    → LLM 호출                 │
     └── undetermined    → LLM 호출 ──┐             │
                                      │             │
                                      ▼             │
                         [axis8_llm.judge_alignment]│
                                      │             │
                              [dedup 캐시 조회]     │
                                      │             │
                             hit ─────┴──── miss    │
                             │              │       │
                             │              ▼       │
                             │      [프로바이더 선택]│
                             │      (env or 자동감지)│
                             │              │       │
                             │              ▼       │
                             │      [_call_deepseek](default)
                             │      또는 _call_openai / _call_claude
                             │              │       │
                             │              ▼       │
                             │      [LLMAlignmentJudgment]
                             │              │       │
                             │              ▼       │
                             └──── [dedup 캐시 저장] ─┘
```

**반환 값 통합** (Phase 5b):
```python
BusinessFit(
    score=judgment.score,
    match_type=judgment.match_type,
    matched_keywords=judgment.matched_keywords,
    reasoning=judgment.reasoning,
    source="llm",   # "whitelist" | "llm" | "pending"
)
```

---

## 7. 재시도·에러 처리

**OpenAI SDK 기본 재시도** — 429/5xx 자동 exponential backoff.

**DeepSeek 응답 검증 실패** (JSON mode 파싱 or Pydantic 검증):
- `_call_deepseek`에 재시도 로직 (`max_retries=2`)
- 최종 실패 시 `RuntimeError` (상위 계층에서 판정 유예 저장)

**명시 catch 대상**:
- `openai.BadRequestError` — 프롬프트 스키마 오류 (프로덕션 회복 불가)
- `openai.RateLimitError` — SDK 재시도 후에도 실패 시 → 판정 유예 저장 · 배치 재시도
- `openai.APIConnectionError` — 네트워크 오류 · 로그 후 재시도 큐

**응답 refusal** (OpenAI): `response.choices[0].message.refusal` 있으면 `RuntimeError`.

---

## 7-1. 팀 배포 (API 키 없는 팀원)

DEEPSEEK_API_KEY는 기술리드만 보유. 팀원이 판정 결과를 화면에 띄우려면:

```
# 기술리드 로컬:
python scripts/run_axis8_llm_batch.py     # DB 캐시 채움 + fixture 자동 덤프
git add backend/app/services/axis8_llm_cache.json && git commit && git push

# 팀원:
git pull                                    # 그게 끝
```

- `_load_llm_cache()`가 fixture(리포지토리) → DB(로컬 배치) 순으로 덮어씀.
- 팀원이 로컬에서 배치를 재실행하면 DB가 fixture를 이긴다(신선한 판정 우선).
- fixture만 수동 갱신하고 싶으면 `python scripts/export_axis8_llm_cache.py`.

## 8. 활성화 상태 (2026-07-16)

`backend/app/services/axis8_llm.py`:
- ✅ **`DEEPSEEK_API_KEY` 세팅됨** → DeepSeek 실 호출 활성
- ✅ **`OPENAI_API_KEY` 세팅됨** → OpenAI 옵션 활성
- ❌ `ANTHROPIC_API_KEY=API_HERE` → Claude 미활성

`.env` 파일 (gitignored). `.env.example`은 팀 공유 템플릿.

**Phase 5b 통합 준비 완료**:
- `judge_alignment()` public entrypoint 시그니처 확정
- `judge_alignment_full()` — usage metrics도 반환 (비용 로깅용)
- dedup 캐시 자동 동작

---

## 9. Phase 5b 통합 예정 사항

- `axis8.classify_alignment(needs_llm=True)` 케이스를 `axis8_llm.judge_alignment()`에 위임
- `services/companies.py:build_business_fit()` 헬퍼가 whitelist 결과 or LLM 결과를 `BusinessFit`으로 변환
- `Company._mock: ["businessFit"]`에서 "businessFit" 제거 (실데이터 활성)
- 배치 로깅으로 실측 비용·캐시 히트율 수집 → `docs/축8_비용시뮬.md` §4 재산정

---

## 10. 한계 & 다음 단계

- **파일럿 gold label 부족** — 4건에서 20~30건으로 확장 (본선 대비 프롬프트 튜닝)
- **DeepSeek 한국어 뉘앙스 한계** — 지금까지 파일럿에서는 안 나옴. 본선 대량 판정에서 관찰 필요
- **Ensemble 로드맵** — DeepSeek + gpt-4o 병렬, 이견 시 human review flag (docs/축8_비용시뮬.md §5)
- **본선 당일**:
  - dedup 캐시 hit rate 실측 → 비용 재산정
  - 프롬프트 caution 항목에 본선 실 사례 추가
  - AXIS8_LLM_PROVIDER 최종 선택 확정

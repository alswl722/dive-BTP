# 축8 LLM 인터페이스 설계 (Phase 3, 실 호출 없이 확정)

> 담당: 팀원 D (형우, 기술리드) · 관련 코드: `backend/app/services/axis8_llm.py`(스텁)
> 결제 승인 후 활성화. 설계·프롬프트·스키마·캐싱·재시도는 현재 확정.

---

## 1. 목적·범위

Phase 2 규칙기반 1단 필터에서 **판단유보(`undetermined`/`unknown_ksic`)** 로 분류된 조합만 LLM(Claude)에 넘겨 시맨틱 정합성 판정을 받는다.

- **미호출**: `whitelisted`, `missing_input`
- **호출 대상**: `undetermined`(관측 없거나 신뢰도 low), `unknown_ksic`(대분류 추출 불가)
- **샘플 실측 호출율**: 92건 중 8건(8.7%). 본선에서는 신규 조합 증가 예상 → 20~40% 가정 (docs/축8_비용시뮬.md)

---

## 2. 프롬프트 설계

### 2.1 원칙

- **시스템 프롬프트 고정** — Anthropic prompt cache 프리픽스로 쓰기 위해 절대 변경 없음
- **기업 사업목적 텍스트 재사용 캐시** — 기업당 1회 write, 이후 read (5분 TTL). 같은 기업의 여러 지원사업 판정 시 큰 절감
- **가변부(user turn)는 지원사업 정보만** — 캐시 breakpoint 뒤에 배치

### 2.2 시스템 프롬프트 (고정, 캐시 대상)

```
<role>
부산테크노파크 심사 담당자 지원 도구의 사업정체성 정합성 판정 assistant.
</role>

<task>
주어진 기업의 등기부등본 사업목적 텍스트와 실제 받은 정부 지원사업의 의미 정합성을 0~100 점수로 판정한다.
어휘 일치가 아닌 의미 일치를 본다.
</task>

<scoring_guide>
- 71~100 (직접일치): 사업목적 핵심 영역에 해당
- 31~70  (간접관련): 직접 서비스는 아니지만 사업목적 지원 가능
- 0~30   (무관):    사업목적과 지원사업 영역이 다름
</scoring_guide>

<output_rules>
- score: 0~100 정수
- match_type: "직접일치" | "간접관련" | "무관"
- matched_keywords: 정합성 근거가 되는 사업목적 텍스트 내 키워드 최대 3개
- reasoning: 담당자가 즉시 이해할 수 있는 한 문장
</output_rules>

<caution>
- 어휘 겹침 부재를 근거로 무관 판정 금지 (샘플에서 jaccard 평균 0.005 관측)
  예: "밸브·산업기계 제조" 사업목적 기업이 "스마트공장 구축 지원"을 받은 것은
     어휘 안 겹치지만 정합. score 71+ 부여 정상.
- 사업목적이 10개 항목으로 다각화된 경우 각 지원사업별 개별 판정, 관련된 항목만 근거로 인용
- 정보 부족 시 score 40~60 중립값 + reasoning에 부족 정보 명시
</caution>
```

### 2.3 User 메시지 (가변, 캐시 대상 + 캐시 무관 부분 분리)

**블록1 (캐시 대상)** — 기업 사업목적 컨텍스트:
```
<company id={company_id}>
<business_purposes>
  1. {purpose_1}
  2. {purpose_2}
  ...
</business_purposes>
</company>
```

**블록2 (캐시 무관)** — 지원사업 정보:
```
다음 지원사업과 위 사업목적의 정합성을 판정해줘.

<support_program>
  사업명: {program_name}
  business_type: {business_type}
  세부구분: {support_detail_main}
  설명: {description}
</support_program>
```

`cache_control`은 `system` 마지막 블록·`user` content 블록1 끝에 부여 (Anthropic 4 breakpoint 제한 준수).

---

## 3. Structured Output 스키마

`client.messages.parse()` + Pydantic 모델로 응답 검증 자동화 (claude-api 스킬 권장 패턴).

```python
class LLMAlignmentJudgment(BaseModel):
    score: int = Field(ge=0, le=100)
    match_type: Literal["직접일치", "간접관련", "무관"]
    matched_keywords: list[str] = Field(default_factory=list)
    reasoning: str
```

- **`matched_keywords`**: 담당자 화면 근거 표시용 — 발표에서도 "왜 이 점수인가" 대응
- **`reasoning`**: 스코어카드 tooltip / 상세보기 노출
- **자유 텍스트 미허용**: 스코어링 재현성 확보

---

## 4. 캐싱 아키텍처 (2단)

### 4.1 앱 레벨 dedup 캐시 (LLM 호출 자체 제거)

**키**: `(company_id, program_code, purposes_sha12)`
- `purposes_sha12`: 사업목적 문자열 정렬 후 SHA-256의 앞 12자 (기업 사업목적 변경 감지)
- **저장소**: Phase 5 통합 시 결정 (SQLite/Redis/dict). 스텁은 in-memory dict

**히트 시**: LLM 호출 없이 이전 판정 재사용 → 비용·지연 완전 절감
**예상 히트율**: 40% — 같은 기업이 유사한 지원사업 조합에 반복 신청하는 패턴

### 4.2 Anthropic prompt cache (호출은 하지만 저렴하게)

**Cache write 대상**:
- System prompt (~500 tokens, 전체 요청에서 1회만 write)
- 기업 사업목적 컨텍스트 (~200 tokens, 기업당 1회 write)

**Cache read 요금**: 기본 input × 0.1 (예: Opus 4.7 $5/1M → $0.5/1M)
**Cache write 요금**: 기본 input × 1.25 (5분 TTL)
**TTL**: 5분(기본). 판정은 batch로 몰아치기 때문에 5분이 적절

**히트 조건 방어** (claude-api 스킬 silent-invalidator 목록 준수):
- ✅ System prompt 상수 (타임스탬프·UUID 없음)
- ✅ 사업목적 텍스트 정렬 후 hashing
- ✅ 모델·`thinking`·`effort` 고정
- ❌ `datetime.now()` 삽입 금지
- ❌ non-deterministic dict serialize 금지

---

## 5. 호출 흐름 (End-to-End)

```
[Phase 2 axis8.classify_alignment]
     │
     ├── whitelisted    → score=100 확정, return  ─┐
     ├── missing_input  → score=None, return       ├─→ Company._mock 교체
     ├── unknown_ksic   → LLM 호출                 │
     └── undetermined   → LLM 호출 ──┐             │
                                     │             │
                                     ▼             │
                        [4.1 app dedup 캐시 조회]  │
                            │                      │
                    hit ────┴──── miss             │
                    │             │                │
                    │             ▼                │
                    │  [4.2 Anthropic prompt cache 포함 호출]
                    │             │                │
                    │             ▼                │
                    │      [LLMAlignmentJudgment]  │
                    │             │                │
                    │             ▼                │
                    └──── [dedup 캐시 저장] ───────┘
```

**반환 값 통합** (Phase 5에서 API 응답 스키마 확정 시):
```python
AlignmentResult(
    status="whitelisted",       # or "llm_judged"
    score=100,                  # or LLM score
    confidence="high",          # or match_type (직접일치/간접관련/무관)
    matched_keywords=[...],     # LLM 판정 시만
    reasoning="...",            # LLM 판정 시만
)
```

---

## 6. 재시도·에러 처리

**Anthropic SDK 기본 재시도** 활용 — `max_retries=2` 기본. 429/5xx 자동 exponential backoff.

**명시 catch 대상**:
- `anthropic.BadRequestError` — 프롬프트 스키마 오류. Phase 3에서 못 잡으면 프로덕션에서 회복 불가 → 스텁 유닛테스트에서 검증
- `anthropic.RateLimitError` — SDK 재시도 후에도 실패 시 → **판정 유예 상태로 저장 후 배치 재시도**
- `anthropic.APIStatusError` (5xx 잔여) — 같음
- `anthropic.APIConnectionError` — 네트워크 오류. 로그 남기고 재시도 큐로

**응답 검증 실패** (Pydantic ValidationError):
- 극히 드물지만 발생 시 `reasoning` 필드에 "판정 실패" 기록 · score=None 저장 · 담당자 화면에 "정합성 판정 재시도 필요" 표시

**추가 방어**:
- `max_tokens=1024` — output이 아무리 커도 초과 없음 (JSON 150~300 tokens 예상)
- `output_config.effort="medium"` — 이 판정은 복잡 추론 아니므로 medium 충분. Opus 4.7 max/xhigh 낭비

---

## 7. 스텁 동작 (현재 상태)

`backend/app/services/axis8_llm.py`:

- **`ANTHROPIC_API_KEY` 미설정 시 `NotImplementedError`** — 실 호출 방지
- 프롬프트 문자열·스키마·캐싱 함수 시그니처는 확정 상태
- Phase 5 통합 시 `AlignmentResult(needs_llm=True)` 케이스를 이 서비스에 위임

**활성화 절차** (결제 승인 후):
1. `.env`에 `ANTHROPIC_API_KEY=sk-ant-...` 추가
2. `pip install -r backend/requirements.txt` (anthropic 패키지 이미 명시됨)
3. Phase 5에서 라우터가 `judge_alignment_llm()` 호출

---

## 8. Phase 3 산출물 체크

- [x] 프롬프트 텍스트 확정 (system·user 2블록 구조)
- [x] Structured output 스키마 (`LLMAlignmentJudgment` Pydantic)
- [x] 2단 캐싱 아키텍처 (앱 dedup + Anthropic prompt cache)
- [x] 재시도·에러 처리 정책
- [x] SDK 호출 스텁 (`axis8_llm.py`, API 키 없으면 NotImplementedError)
- [x] 비용 시뮬 근거표 → `docs/축8_비용시뮬.md`
- [x] `Company._mock: ["businessFit"]` 교체 지점 명시 (Phase 5)

## 9. 한계 & 다음 단계

- **실 호출 검증 미완**: 결제 승인 후 gold label 5건으로 프롬프트 튜닝, `effort`·`thinking` 파라미터 실측
- **캐시 TTL 최적화**: 5분 TTL이 batch 판정에 적합하지만, 실 트래픽 패턴 확인 후 조정 가능(1시간 TTL은 write 비용 2배지만 오래 유지)
- **모델 선택**: 결제 승인 시 Opus 4.7 default. 비용·품질 tradeoff에 따라 Sonnet 4.6/Haiku 4.5 스위치 가능 (비용시뮬 참조). 팀 결정 사항
- **본선 gold label 확장**: 20~30건 손판정 → 프롬프트 few-shot 예시 추가 검토

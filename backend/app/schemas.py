"""Pydantic 응답 스키마 — frontend/types/index.ts를 그대로 옮김(소스오브트루스는 그쪽).

필드가 어긋나면 FastAPI가 검증 단계에서 바로 에러를 내므로, 프론트 타입과의
불일치를 조기에 잡아준다.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Axis = Literal["성장성", "수익성", "효율성", "안정성"]
ReviewStatus = Literal["후보", "선정", "제외"]

# 축8 사업정체성 정합성 판정 (LLM 기반)
MatchType = Literal["직접일치", "간접관련", "무관", "판단유보"]
AlignmentSource = Literal["whitelist", "llm", "pending"]

# 축9 BTP 지원이력 flag (반복지원 이상탐지, 스코어 미포함)
FlagStatus = Literal["flag", "cleared", "observe", "normal", "unknown"]
Segment = Literal["소액다건", "대형소수", "대형다건", "소액소수"]

# 종합점수(심사 스크리닝용 보조 지표) breakdown 키 — 재무4축+기술2축+정합성
CompositeAxis = Literal["성장성", "수익성", "효율성", "안정성", "R&D특허", "NTIS", "정합성"]


class TrendPoint(BaseModel):
    year: int
    value: float | None = None


class SupportRecord(BaseModel):
    date: str
    result: Literal["선정", "탈락", "포기"]
    bizType: str
    amount: float
    programCode: str | None = None
    # ⚠️ Pydantic은 응답 모델에 없는 키를 **조용히 버린다**(에러가 아니라 누락).
    # 아래 4개가 빠져 있어서 company_view는 값을 채웠는데 API 응답에서만 사라졌고,
    # 화면이 사업명 대신 사업코드(E2_1_6)로, 세부품목은 "품목 미상"으로 폴백됐다.
    # fixture(parquet) 경로는 Pydantic을 안 거쳐서 정상 → 두 경로가 달라 보였던 원인.
    # frontend/types/index.ts의 SupportRecord와 항상 1:1로 맞출 것.
    programName: str | None = None      # 화면 표시용 사업명(코드보다 우선)
    year: int | None = None
    startDate: str | None = None   # 수행 시작일 — 동시 수혜(기간 겹침) 판정용
    endDate: str | None = None     # 수행 종료일
    supportDetailMain: str | None = None   # 지원구분(주요지원) — 세부품목 라벨
    supportDetailOther: str | None = None  # 지원구분(주요지원 외) — 패키지지원만 채워짐
    supportItem: str | None = None         # 지원품목(자유기술)


class Patents(BaseModel):
    등록: int | None = None
    출원: int | None = None


class Ntis(BaseModel):
    주관: int | None = None
    위탁: int | None = None


# --- 축4·5·6 기술력 (원장 기반) -------------------------------------------
class TechPatents(BaseModel):
    출원: int | None = None
    등록: int | None = None
    등록전환율: float | None = None      # 등록÷출원 — 특허의 질
    최근3년출원: int | None = None       # 활동성
    최근출원비중: float | None = None
    활동공백년수: float | None = None    # 마지막 출원 이후 경과(클수록 R&D 정체)
    소멸률: float | None = None          # 등록특허 권리 소멸 비율(자금압박 신호)
    첫특허업력: float | None = None
    대표개인명의_등록: int | None = None  # 법인 아닌 대표·임원 개인 명의 등록특허(이탈 시 회사에 안 남음)


class TechRnd(BaseModel):
    집약도: float | None = None          # 연구개발비÷매출
    집약도추세: float | None = None


class TechNtis(BaseModel):
    주관과제수: int | None = None        # 스냅샷 중복 제거 후
    정부연구비_원: float | None = None   # ⚠️ 단위 원(재무는 천원)
    민간연구비_원: float | None = None   # 자체 R&D 매칭액
    민간부담률: float | None = None      # 민간/(정부+민간) — 지원금만 vs 자기투자 구분
    최근수주연도: int | None = None      # '과거의 영광'인지 판별
    진행중과제수: int | None = None      # 현재도 수행 중인 과제
    부처다양성: int | None = None
    위탁과제수: int | None = None
    산학협력: bool = False


class TechCertification(BaseModel):
    보유수: int | None = None
    핵심보유: bool = False
    실체괴리: bool = False               # 핵심인증 보유 + 등록특허0 + 국가R&D0


class TechDomain(BaseModel):
    주력기술분야: str | None = None
    출처: str | None = None              # 표준분류 / KSIC추정 / 미상
    분야수: int | None = None
    집중도: float | None = None          # HHI — 1=단일분야 전문
    btp중점사업: list[str] = Field(default_factory=list)
    국가전략기술: list[str] = Field(default_factory=list)   # 12대 국가전략기술
    기술수준등급: str | None = None      # OECD 고위/중고위/중저위/저위
    지역전략산업: str | None = None      # 부산 9대 전략산업(제6차) 매칭명
    지역전략산업_매칭유형: str | None = None  # 고유(강함) | 공통(약함)
    지역전략산업_부합: bool = False


class TechScores(BaseModel):
    rndPatent: float | None = None
    ntis: float | None = None
    백분위기준: str | None = None        # 업종내 / 전체fallback


class PatentRecord(BaseModel):
    """특허 원장 1건 — 집계 숫자의 근거 확인용(드릴다운)."""

    type: str | None = None        # 특허권 / 실용신안권 (상표·디자인은 집계에서 제외)
    status: str | None = None      # 등록 / 공개(출원 계류)
    applied: str | None = None
    registered: str | None = None
    valid: bool | None = None      # 등록유효여부 — False면 권리 소멸
    relation: str | None = None    # 회사와의관계코드(본인/대표이사/임원) — 개인 명의 IP 식별


class Tech(BaseModel):
    patents: TechPatents
    rnd: TechRnd
    ntis: TechNtis
    certification: TechCertification
    domain: TechDomain
    scores: TechScores
    # 지표별 동종 대비 백분위(0~100). 절대값만으로는 판단이 어려워 함께 제공.
    percentiles: dict[str, float | None] = Field(default_factory=dict)
    patentList: list[PatentRecord] = Field(default_factory=list)


class Support(BaseModel):
    건수: int | None = None        # 지원 항목수(행 수 — 패키지 세부품목 포함). 표시용
    선정건수: int | None = None    # 선정된 사업 수(DISTINCT 연도+사업코드). 반복·중복 판정 기준
    총지원금_천원: float | None = None
    지원연도수: int | None = None


class Passthrough(BaseModel):
    영업외손익비중: float | None = None
    자본잠식_플래그: float | None = None
    # 영업외손익 괴리 배지 — 영업<0·순≥0(영업외로 연명)이 관측연수 중 몇 년인지(다년).
    영업외의존_연수: float | None = None
    재무관측연수: float | None = None
    # 고용 회전율 배지 — 국민연금 취업·퇴직으로 인력 이동 측정(가입자수 성장 착시 방어).
    이직률_최근: float | None = None
    고용회전율_최근: float | None = None
    고용순증_최근: float | None = None
    고용관측연수: float | None = None


class EmploymentYear(BaseModel):
    """연도별 국민연금 가입/취업/퇴직 — 고용 배지 펼침표."""

    year: int
    가입: float | None = None
    취업: float | None = None
    퇴직: float | None = None


class EmploymentScaleYear(BaseModel):
    """연도별 종업원수·1인평균급여 — 고용 탭 트렌드 원천.

    급여 단위=원(원본 그대로). 프론트가 화면 표기 시 만원/억원으로 환산.
    종업원수는 명 단위 정수 기대이나 결측 방어 위해 float.
    """

    year: int
    종업원수: float | None = None
    급여_원: float | None = None


class Employment(BaseModel):
    """고용 탭·배지 상세 — 규모·처우·생산성·안정성 4개 축의 원천.

    스코어링 미포함(passthrough). 종합점수·재무 4축 왜곡 없음.
    docs/고용회전율_영업외손익_설계노트.md의 결정 유지.
    """

    # 기존 (배지 · 국민연금 펼침표)
    회전율백분위: float | None = None
    series: list[EmploymentYear] | None = None

    # 규모 · 변화 (신규)
    종업원수_최근: float | None = None
    종업원수_CAGR: float | None = None            # decimal (0.15 = 15%)
    종업원수_증감_5년: float | None = None         # 최근−최초 유효연도 (명)
    종업원수증가_백분위: float | None = None       # 업종 내 상위 N%

    # 처우 (신규)
    급여_최근_원: float | None = None              # 단위=원 (원본 그대로)
    급여_CAGR: float | None = None                # decimal
    급여_백분위: float | None = None               # 업종 내 상위 N%

    # 인력 생산성 (신규)
    인당매출_최근_천원: float | None = None
    인당매출_백분위: float | None = None
    인당영업이익_최근_천원: float | None = None

    # 규모·처우 트렌드 (신규) — 종업원수·급여 5년 시계열
    scaleSeries: list[EmploymentScaleYear] | None = None


class NonopYear(BaseModel):
    """연도별 영업이익·당기순이익(천원) — 영업외 연명 배지 펼침표."""

    year: int
    영업이익: float | None = None
    당기순이익: float | None = None


class NonopIncome(BaseModel):
    """영업외 연명 배지 상세 — 연도별 본업 vs 최종 손익."""

    series: list[NonopYear] | None = None


class SizeInconsistency(BaseModel):
    """신고 기업규모 vs 실측의 법정 기준 위반 (값은 안 고침, 사실만 노출)."""

    rule: str      # 소상공인_종업원초과 | 중소_졸업선_매출초과 | 중소_졸업선_자산초과
    detail: str    # 사람이 읽는 근거 문장


class DataQuality(BaseModel):
    missing: list[str]
    inconsistencies: list[SizeInconsistency] = []
    ok: bool


class AlignmentJudgment(BaseModel):
    """축8 개별 지원사업 정합성 판정 (스코어카드 상세용)."""

    programCode: str
    year: int
    programName: str | None = None
    businessType: str | None = None
    score: float | None = Field(None, ge=0, le=100)
    matchType: MatchType
    matchedKeywords: list[str] = Field(default_factory=list)
    reasoning: str
    source: AlignmentSource


class BusinessFit(BaseModel):
    """축8 종합 정합성 (스코어카드 상단·리스트용)."""

    score: float | None = Field(None, ge=0, le=100)  # 판정 완료분 평균
    matchType: MatchType   # 대표 판정 (majority)
    summary: str            # 자연어 요약 (담당자용 한 문장)
    totalJudged: int        # 정합성 판정 완료 건수
    totalPending: int       # LLM 판정 대기 건수
    breakdown: dict[str, int] = Field(default_factory=dict)  # {직접일치: N, 간접관련: N, 무관: N, 판단유보: N}
    judgments: list[AlignmentJudgment] = Field(default_factory=list)  # 지원사업별 상세


class DuplicateFlag(BaseModel):
    """축9 반복지원 flag 판정 (스코어 미포함, 배지·경고용)."""

    status: FlagStatus
    label: str                                  # 발표·화면 한 줄 라벨
    isRepeat: bool
    growthState: Literal["stagnant", "growing", "unknown"]
    segment: Segment | None = None
    isHighDiversity: bool = False               # 사업유형 다양성 상위 percentile
    supportCount: int
    totalAmountThousand: float
    businessTypeDiversity: int
    maxConsecutiveYears: int
    # 성장 판정 근거 — 축1(민지) 산출 소비. None은 축1 데이터 없음(자본잠식·재무결측 등).
    # 프론트 근거 카드에서 임계값(하위 30%) 대비 노출용. docs/성장률_인터페이스.md.
    growthScore: float | None = None            # 0~100 백분위. 30 미만 = 정체
    revenueCagr: float | None = None            # decimal (0.15 = 15%)
    revenueDelta: float | None = None           # 천원 단위 매출 증가액


class CompositeScore(BaseModel):
    """종합점수(심사 스크리닝용 보조 지표). docs/종합점수_설계노트.md.

    축별 breakdown이 진짜 판단 근거이므로 항상 함께 노출할 것(단독 표기 금지).
    """

    score: float | None = Field(None, ge=0, le=100)  # min(가중평균, 최저축+cap_margin)
    rawWeightedAverage: float | None = None  # 캡 적용 전 가중평균(참고용)
    lowestAxis: CompositeAxis | None = None
    lowestAxisScore: float | None = None
    validAxisRatio: float
    breakdown: dict[CompositeAxis, float | None]


class Company(BaseModel):
    id: int
    name: str
    industry: str | None = None
    industryCode: str | None = None
    region: str | None = None
    revenueLatest: float | None = None
    avgSalaryLatest: float | None = None
    listingType: str | None = None               # 상장구분(코스피/코스닥) 또는 외감구분(외감/일반법인) — 값 그대로
    foundedDate: str | None = None               # 설립일(YYYY-MM-DD). 업력 계산 원천
    companyStatus: str | None = None             # 기업상태 텍스트("정상" 등)
    isClosed: bool = False                       # 휴·폐업 여부 — 지원 대상에서 즉시 걸러야 하는 신호
    closureType: str | None = None               # 휴폐업 구분(휴업/폐업). isClosed일 때만 의미
    capitalThousand: float | None = None         # 납입자본금(천원)
    scores: dict[Axis, float | None]
    percentiles: dict[str, float | None]
    rawMetrics: dict[str, float | None]
    trends: dict[str, list[TrendPoint]]
    certifications: dict[str, bool]
    patents: Patents
    ntis: Ntis
    tech: Tech | None = None                     # 축4·5·6 기술력(원장 기반)
    support: Support
    supportHistory: list[SupportRecord]
    passthrough: Passthrough
    employment: Employment | None = None         # 고용 회전율 배지 상세(바+시계열)
    nonopIncome: NonopIncome | None = None       # 영업외 연명 배지 상세(연도별 손익)
    percentileBasis: str | None = None
    dataQuality: DataQuality
    reviewStatus: ReviewStatus = "후보"
    businessFit: BusinessFit | None = None       # 축8 (LLM 정합성 판정)
    compositeScore: CompositeScore | None = None  # 재무4축+기술2축+정합성, 최저축 캡 적용
    duplicateFlag: DuplicateFlag | None = None   # 축9 (반복지원 flag)
    # company_view.py 산출물의 키는 "_mock"(밑줄 시작 = pydantic이 private로 취급하는
    # 이름이라 그대로 필드명으로 못 씀) → alias로 매핑. populate_by_name=True로 입력 시
    # "_mock"/"mock" 둘 다 받고, response_model_by_alias 기본값(True)이라 출력 JSON은
    # "_mock"으로 나가 프론트 타입(_mock: string[])과 그대로 맞음.
    mock: list[str] = Field(default_factory=list, alias="_mock")

    model_config = ConfigDict(populate_by_name=True)


class ReviewStatusUpdate(BaseModel):
    status: ReviewStatus
    programKey: str            # "연도:사업코드" — 사업 단위 상태


class ReviewStatusResponse(BaseModel):
    companyId: int
    programKey: str
    reviewStatus: ReviewStatus


class ProgramReviewStatus(BaseModel):
    """GET /review-status 항목 — 전체 (기업, 사업) 상태."""

    companyId: int
    programKey: str
    status: ReviewStatus


class RankingRow(BaseModel):
    id: int
    name: str
    industry: str | None = None
    건수: int | None = None        # 선정된 사업 수(반복선정 랭킹 정렬 기준)
    항목수: int | None = None      # 지원 항목수(행 수 — 패키지 세부품목 포함). 근거 표시용
    총지원금_천원: float | None = None


class Rankings(BaseModel):
    byCount: list[RankingRow]
    byAmount: list[RankingRow]


class BizTypeCount(BaseModel):
    type: str
    count: int


class RegionCount(BaseModel):
    region: str
    count: int


class ResultCount(BaseModel):
    result: str
    count: int


class Program(BaseModel):
    year: int
    programCode: str
    name: str | None = None
    macroCategory: str | None = None  # 사업구분 원본(RnD/복합/기업지원 등, 값 혼재 — 필터엔 businessType 권장)
    businessType: str | None = None  # 사업유형 7종 + 사업기획 등(지원사업 목록 필터 기준 컬럼)
    startDate: str | None = None
    endDate: str | None = None
    ministry: str | None = None
    localGov: str | None = None
    description: str | None = None
    applicantCount: int  # support_records 매칭 신청기업수(중복 지원 제외 distinct)
    selectedCount: int  # 선정(지원대상) 기업수
    totalAmountThousand: float  # 선정 건 지원금 합계(천원). 결측은 0으로 합산되므로 아래 값과 함께 읽을 것
    amountMissingCount: int = 0  # 선정 건 중 지원금이 결측인 건수 — "0원"과 "미기재"를 화면에서 구분하기 위함
    detailItems: list[str] = []  # 세부품목(support_detail_main) distinct. 신청이력 없는 사업은 빈 배열.


class ChatbotAsk(BaseModel):
    question: str = Field(min_length=1, max_length=500)


class ChatbotAnswer(BaseModel):
    """챗봇 응답 — action에 따라 채워지는 필드가 다르다.

    - navigate: path 채움. 프론트가 router.push. sql/columns/rows 비어있음.
    - query:    sql/columns/rows/answer 전부 채움. path=null.
    - clarify:  answer만 채움 (요청 처리 불가 사유).
    """

    question: str
    action: Literal["navigate", "query", "clarify"] = "query"
    intent: str                              # LLM이 이 질문을 어떻게 해석했는지(한 문장)
    path: str | None = None                  # action=navigate에서 채워짐 — /companies/{id} 등
    sql: str = ""                            # 실행된 SELECT (query에서만)
    columns: list[str] = Field(default_factory=list)
    rows: list[dict] = Field(default_factory=list)
    answer: str                              # 담당자용 한/두 문장 (모든 action에서 채워짐)
    error: str | None = None


class NoteMention(BaseModel):
    """메모가 가리키는 대상. company면 companyId만, program이면 year+code만 채워진다."""

    targetType: Literal["company", "program"]
    companyId: int | None = None
    programYear: int | None = None
    programCode: str | None = None


class Note(BaseModel):
    id: int
    body: str        # 멘션 인라인 마크업 포함 원문 — @[표시명](company:1049)
    author: str      # 작성 시점 role 라벨(인증 도입 시 user_id로 대체)
    createdAt: str
    updatedAt: str
    mentions: list[NoteMention] = []


class NoteCreate(BaseModel):
    body: str = Field(min_length=1)
    author: str = Field(min_length=1)


class NoteUpdate(BaseModel):
    body: str = Field(min_length=1)


class Dashboard(BaseModel):
    totalCompanies: int
    bizTypeDist: list[BizTypeCount]
    regionDist: list[RegionCount]
    resultDist: list[ResultCount]
    dataQualityIssues: int

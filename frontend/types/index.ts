// 재무 축 산출물 + master 기반 프론트 타입.
// fixture(JSON)와 향후 FastAPI 응답이 동일 스키마를 따른다.

export const AXES = ["성장성", "수익성", "효율성", "안정성"] as const;
export type Axis = (typeof AXES)[number];

export const REVIEW_STATUSES = ["후보", "선정", "보류", "제외"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

// 축8 사업정체성 정합성 (LLM 판정)
export const MATCH_TYPES = ["직접일치", "간접관련", "무관", "판단유보"] as const;
export type MatchType = (typeof MATCH_TYPES)[number];
export type AlignmentSource = "whitelist" | "llm" | "pending";

// 축9 BTP 지원이력 flag (스코어 미포함)
export const FLAG_STATUSES = ["flag", "cleared", "observe", "normal", "unknown"] as const;
export type FlagStatus = (typeof FLAG_STATUSES)[number];
export const SEGMENTS = ["소액다건", "대형소수", "대형다건", "소액소수"] as const;
export type Segment = (typeof SEGMENTS)[number];

export type AxisScores = Record<Axis, number | null>;

// 종합점수 그룹(재무/기술/정합성) + 재무 세부축 이름. 프론트 가중치 조정 UI가 참조.
export const COMPOSITE_GROUPS = ["finance", "tech", "alignment"] as const;
export type CompositeGroup = (typeof COMPOSITE_GROUPS)[number];

// compositeScore.breakdown 키 — 재무4축 + 기술2축 + 정합성. 백엔드 composite_score.py와 동일.
export const COMPOSITE_AXES = ["성장성", "수익성", "효율성", "안정성", "R&D특허", "NTIS", "정합성"] as const;
export type CompositeAxis = (typeof COMPOSITE_AXES)[number];

// 종합점수(심사 스크리닝용 보조 지표) — docs/종합점수_설계노트.md.
// 축별 breakdown이 진짜 판단 근거이므로 항상 함께 노출할 것(종합점수 단독 표기 금지).
export interface CompositeScore {
  score: number | null;               // min(가중평균, 최저축+cap_margin)
  rawWeightedAverage: number | null;  // 캡 적용 전 가중평균(참고용)
  lowestAxis: CompositeAxis | null;
  lowestAxisScore: number | null;
  validAxisRatio: number;
  breakdown: Record<CompositeAxis, number | null>;
}

export interface TrendPoint {
  year: number;
  value: number | null;
}

export interface SupportRecord {
  date: string; // YYYY-MM-DD
  result: "선정" | "탈락" | "포기";
  bizType: string;
  amount: number; // 천원 (탈락/포기는 0)
  programCode: string | null; // support_programs.program_code 조인키(연도+코드가 PK)
  year: number | null;
  startDate: string | null; // 수행 시작일 — 동시 수혜(기간 겹침) 판정용
  endDate: string | null;   // 수행 종료일
}

// 축8 개별 지원사업 정합성 판정
export interface AlignmentJudgment {
  programCode: string;
  year: number;
  programName: string | null;
  businessType: string | null;
  score: number | null;
  matchType: MatchType;
  matchedKeywords: string[];
  reasoning: string;
  source: AlignmentSource;
}

// 축8 종합 정합성 (스코어카드 상단·리스트용)
export interface BusinessFit {
  score: number | null;             // 판정 완료분 평균
  matchType: MatchType;             // 대표 판정 (majority)
  summary: string;                  // 자연어 요약
  totalJudged: number;              // 판정 완료 건수
  totalPending: number;             // LLM 대기 건수
  breakdown: Record<string, number>; // {직접일치, 간접관련, 무관, 판단유보}
  judgments: AlignmentJudgment[];
}

// 축9 반복지원 flag (스코어 미포함)
export interface DuplicateFlag {
  status: FlagStatus;
  label: string;
  isRepeat: boolean;
  growthState: "stagnant" | "growing" | "unknown";
  segment: Segment | null;
  isHighDiversity: boolean;
  supportCount: number;
  totalAmountThousand: number;
  businessTypeDiversity: number;
  maxConsecutiveYears: number;
}

export interface Company {
  id: number;
  name: string;
  industry: string | null;
  industryCode: string | null;
  region: string | null;
  revenueLatest: number | null; // 천원
  avgSalaryLatest: number | null; // 천원(원본 "원" 단위를 /1000으로 통일)
  scores: AxisScores;
  percentiles: Record<string, number | null>; // 파생컬럼 → 0~100 백분위
  rawMetrics: Record<string, number | null>; // 파생컬럼 원값
  trends: Record<string, TrendPoint[]>;
  certifications: Record<string, boolean>;
  patents: { 등록: number | null; 출원: number | null };
  ntis: { 주관: number | null; 위탁: number | null };
  support: { 건수: number | null; 총지원금_천원: number | null; 지원연도수: number | null };
  supportHistory: SupportRecord[];
  passthrough: {
    영업외손익비중: number | null;
    자본잠식_플래그: number | null;
    영업외의존_연수: number | null;
    재무관측연수: number | null;
    이직률_최근: number | null;
    고용회전율_최근: number | null;
    고용순증_최근: number | null;
    고용관측연수: number | null;
  };
  employment?: {
    회전율백분위: number | null;
    series: { year: number; 가입: number | null; 취업: number | null; 퇴직: number | null }[] | null;
  } | null;
  nonopIncome?: {
    series: { year: number; 영업이익: number | null; 당기순이익: number | null }[] | null;
  } | null;
  percentileBasis: string | null; // "업종내" | "전체fallback"
  dataQuality: { missing: string[]; ok: boolean };
  _mock: string[]; // 목업으로 채운 필드(투명성)
  reviewStatus: ReviewStatus; // 찜 상태. company_review_status 테이블에 영속화(PATCH /companies/{id}/review-status)
  businessFit: BusinessFit | null;     // 축8 (LLM 정합성 판정)
  duplicateFlag: DuplicateFlag | null; // 축9 (반복지원 flag)
  tech: Tech | null;                   // 축4·5·6 기술력(원장 기반)
  compositeScore: CompositeScore | null; // 재무4축+기술2축+정합성, 최저축 캡 적용
}

// 축4 R&D·특허 / 축5 인증 / 축6 NTIS / 축4-1 기술도메인.
// patents·ntis(위 상단 필드)는 원장 집계값으로 교체됨 — master 집계컬럼은 신뢰 불가
// (특허=비단조 flow + 상표·디자인 혼입 / NTIS=스냅샷 중복 약 2.9배).
export interface Tech {
  patents: {
    출원: number | null;
    등록: number | null;
    등록전환율: number | null;   // 등록÷출원 — 특허의 질
    최근3년출원: number | null;  // 활동성
    최근출원비중: number | null;
    활동공백년수: number | null; // 마지막 출원 이후 경과(클수록 R&D 정체)
    소멸률: number | null;       // 등록특허 권리 소멸 비율(자금압박 신호)
    첫특허업력: number | null;
  };
  rnd: { 집약도: number | null; 집약도추세: number | null };
  ntis: {
    주관과제수: number | null;
    정부연구비_원: number | null; // ⚠️ 단위 원(재무는 천원)
    부처다양성: number | null;
    위탁과제수: number | null;
    산학협력: boolean;
  };
  certification: {
    보유수: number | null;
    핵심보유: boolean;
    실체괴리: boolean;           // 핵심인증 보유 + 등록특허0 + 국가R&D0
  };
  domain: {
    주력기술분야: string | null;
    출처: string | null;         // "표준분류" | "KSIC추정" | "미상"
    분야수: number | null;
    집중도: number | null;       // HHI — 1=단일분야 전문
    btp중점사업: string[];
    국가전략기술: string[];      // 12대 국가전략기술
    기술수준등급: string | null; // OECD 고위/중고위/중저위/저위
  };
  scores: {
    rndPatent: number | null;
    ntis: number | null;
    백분위기준: string | null;
  };
  // 지표별 동종 대비 백분위(0~100). 절대값만으로는 "많은 건지" 알 수 없어 함께 제공.
  // ⚠️ scores.백분위기준이 "전체fallback"이면 동종 표본 부족 — 화면에 표기할 것.
  percentiles: Record<string, number | null>;
  // 드릴다운 — 집계 숫자("등록 N건")의 근거. 같은 기준(기술 IP만)으로 필터됨.
  patentList: PatentRecord[];
}

export interface PatentRecord {
  type: string | null;       // 특허권 / 실용신안권
  status: string | null;     // 등록 / 공개(출원 계류)
  applied: string | null;
  registered: string | null;
  valid: boolean | null;     // false면 권리 소멸
}

// support_programs(실사업 목록) + support_records 집계. macroCategory는 원본 시트 간
// 표기가 혼재돼 있어(예: support_records.business_type엔 없는 'RnD'가 여기 있음) 필터는
// businessType 기준으로 쓴다.
export interface Program {
  year: number;
  programCode: string;
  name: string | null;
  macroCategory: string | null;
  businessType: string | null;
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null;
  ministry: string | null;
  localGov: string | null;
  description: string | null;
  applicantCount: number;
  selectedCount: number;
  totalAmountThousand: number;
  // 선정 건 중 지원금 결측 건수. 합계는 결측을 0으로 더하므로 "0원"과 "미기재"를 구분하려면 이 값이 필요하다.
  amountMissingCount: number;
  detailItems: string[]; // 세부품목(support_detail_main) distinct. 신청이력 없으면 빈 배열.
}

export interface RankingRow {
  id: number;
  name: string;
  industry: string | null;
  건수: number | null;
  총지원금_천원: number | null;
}

export interface Rankings {
  byCount: RankingRow[];
  byAmount: RankingRow[];
}

export interface Dashboard {
  totalCompanies: number;
  bizTypeDist: { type: string; count: number }[];
  regionDist: { region: string; count: number }[];
  resultDist: { result: string; count: number }[];
  dataQualityIssues: number;
}

// 메모 — 담당자가 심사하며 남기는 기록. 본문에 @기업·#사업 멘션을 인라인 마크업으로 포함.
export interface NoteMention {
  targetType: "company" | "program";
  companyId: number | null;
  programYear: number | null;
  programCode: string | null;
}

export interface Note {
  id: number;
  body: string;   // @[기업 1049](company:1049) 형태 마크업 포함 원문
  author: string; // 작성 시점 role 라벨
  createdAt: string;
  updatedAt: string;
  mentions: NoteMention[];
}

// 챗봇 — action에 따라 채워지는 필드가 다르다.
//   navigate: path 채움. 프론트가 router.push. sql/columns/rows 비어있음.
//   query:    sql/columns/rows/answer 전부 채움. path=null.
//   clarify:  answer만 채움 (요청 처리 불가 사유).
export type ChatbotAction = "navigate" | "query" | "clarify";

export interface ChatbotAnswer {
  question: string;
  action: ChatbotAction;
  intent: string;
  path: string | null;
  sql: string;
  columns: string[];
  rows: Record<string, unknown>[];
  answer: string;
  error: string | null;
}

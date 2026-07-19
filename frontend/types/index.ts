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
  passthrough: { 영업외손익비중: number | null; 자본잠식_플래그: number | null };
  percentileBasis: string | null; // "업종내" | "전체fallback"
  dataQuality: { missing: string[]; ok: boolean };
  _mock: string[]; // 목업으로 채운 필드(투명성)
  reviewStatus: ReviewStatus; // 찜 상태. company_review_status 테이블에 영속화(PATCH /companies/{id}/review-status)
  businessFit: BusinessFit | null;     // 축8 (LLM 정합성 판정)
  duplicateFlag: DuplicateFlag | null; // 축9 (반복지원 flag)
  tech: Tech | null;                   // 축4·5·6 기술력(원장 기반)
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

// 챗봇 — DeepSeek 텍스트투SQL 결과. rows/columns는 UI가 표로 렌더링,
// answer는 담당자용 한/두 문장 요약, sql은 신뢰 확보용 노출.
export interface ChatbotAnswer {
  question: string;
  intent: string;
  sql: string;
  columns: string[];
  rows: Record<string, unknown>[];
  answer: string;
  error: string | null;
}

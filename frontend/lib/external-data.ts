// 외부 공공데이터 연동 — 심사자용 기술력 보강 신호(R&D 축).
//
// ⚠️ 현재 데모 데이터는 비식별(사업자번호 없음)이라 실 API 호출이 불가하다.
// 그래서 소스 모드를 config(EXTERNAL_MODE)로 두고, 지금은 "mock" 어댑터가 이미 보유한
// 데이터에서 값을 "결정론적으로" 파생한다(같은 기업 → 항상 같은 값). 실 운영에서는
// mode를 "live"로 바꾸고, 사업자등록번호 기반 공공 API 어댑터를 끼우면 된다.
//   - 벤처확인 유형: 중기부 벤처확인 명단(data.go.kr 15084581)
//   - 특허 기술분류(IPC): 특허청 KIPRIS Plus 서지 API
//   - 정부지원 대비 성과: NTIS 과제·성과 API (현재는 보유 NTIS 집계로 근사 계산 — 실측)
// 설계 근거: docs/외부데이터_설계노트.md

import type { Company } from "@/types";

export type ExternalMode = "mock" | "live";

/** 소스 모드. 실 데이터(사업자번호) 확보 시 "live"로 전환하고 API 어댑터를 연결한다. */
export const EXTERNAL_MODE: ExternalMode = "mock";

export type SignalSource = "mock" | "derived" | "live";

export type VentureType = "연구개발형" | "혁신성장형" | "벤처투자형" | "미확인";

export interface VentureConfirm {
  isVenture: boolean;
  type: VentureType;
  /** 유형 판정 근거(목업). 실 연동 시 벤처확인 공시의 확정 유형으로 대체. */
  reason: string;
}

export interface PatentClassSignal {
  topField: string; // 대표 기술영역
  ipcSection: string; // 대표 IPC 섹션(목업 추정)
  concentration: number; // 0~100, 높을수록 특정 분야 집중(전문형)
  fieldCount: number;
  tone: "good" | "warn" | "muted"; // 전문형(집중) good / 분산 warn
}

export interface GovRndEfficiencySignal {
  govFundEok: number; // 정부연구비(억원)
  registeredPatents: number; // 등록 특허(건)
  patentsPerEok: number | null; // 억원당 등록특허 — null=정부R&D 없음
  tone: "good" | "warn" | "muted";
  note: string;
}

export interface TechExternalSignals {
  source: SignalSource;
  venture: VentureConfirm;
  patentClass: PatentClassSignal | null;
  govRnd: GovRndEfficiencySignal | null;
}

// 주력 기술분야 → 대표 IPC 섹션(목업 추정). 실 연동 시 KIPRIS 특허별 IPC 실값으로 대체.
const IPC_SECTION_MAP: { kw: string; sec: string }[] = [
  { kw: "반도체", sec: "H 전기" },
  { kw: "전기", sec: "H 전기" },
  { kw: "전자", sec: "H 전기" },
  { kw: "정보", sec: "G 물리(계측·연산)" },
  { kw: "소프트", sec: "G 물리(계측·연산)" },
  { kw: "AI", sec: "G 물리(계측·연산)" },
  { kw: "화학", sec: "C 화학·야금" },
  { kw: "소재", sec: "C 화학·야금" },
  { kw: "바이오", sec: "C 화학·야금" },
  { kw: "의료", sec: "A 생활필수품" },
  { kw: "식품", sec: "A 생활필수품" },
  { kw: "기계", sec: "F 기계·엔진" },
  { kw: "부품", sec: "F 기계·엔진" },
  { kw: "건설", sec: "E 건설·광산" },
];

function guessIpcSection(field: string | null | undefined): string {
  if (!field) return "미상";
  const hit = IPC_SECTION_MAP.find((m) => field.includes(m.kw));
  return hit ? `${hit.sec} (추정)` : "복합 분야 (추정)";
}

/** 벤처확인 유형(목업) — 보유 데이터에서 결정론적으로 파생. */
function deriveVenture(company: Company): VentureConfirm {
  const isVenture = Boolean(company.certifications?.["벤처기업"]);
  if (!isVenture) return { isVenture: false, type: "미확인", reason: "벤처확인 명단 미등재" };

  const t = company.tech;
  const hasRnd = (t?.patents.등록 ?? 0) > 0 || (t?.ntis.정부연구비_원 ?? 0) > 0;
  const growth = company.scores?.성장성 ?? null;

  if (hasRnd) return { isVenture: true, type: "연구개발형", reason: "등록특허·정부R&D 실적 보유" };
  if (growth != null && growth >= 60) return { isVenture: true, type: "혁신성장형", reason: "성장성 상위 + 기술 혁신성" };
  return { isVenture: true, type: "벤처투자형", reason: "R&D 실적 근거 부족 — 투자유치형 추정" };
}

/** 특허 기술분류 집중도(목업) — tech.domain(HHI·분야수·주력분야)에서 파생. */
function derivePatentClass(company: Company): PatentClassSignal | null {
  const d = company.tech?.domain;
  if (!d || (company.tech?.patents.등록 ?? 0) === 0) return null;
  const conc = d.집중도 != null ? Math.round(d.집중도 * 100) : null;
  return {
    topField: d.주력기술분야 ?? "미상",
    ipcSection: guessIpcSection(d.주력기술분야),
    concentration: conc ?? 0,
    fieldCount: d.분야수 ?? 0,
    tone: conc == null ? "muted" : conc >= 60 ? "good" : "warn",
  };
}

/** 정부지원 대비 성과 — 보유 NTIS 정부연구비 대비 등록특허(실측 근사). */
function deriveGovRnd(company: Company): GovRndEfficiencySignal | null {
  const t = company.tech;
  if (!t) return null;
  const won = t.ntis.정부연구비_원 ?? 0;
  const eok = won / 1e8; // 원 → 억원
  const patents = t.patents.등록 ?? 0;
  if (eok <= 0) {
    return { govFundEok: 0, registeredPatents: patents, patentsPerEok: null, tone: "muted", note: "정부 R&D 수주 이력 없음" };
  }
  const ratio = patents / eok;
  return {
    govFundEok: Math.round(eok * 10) / 10,
    registeredPatents: patents,
    patentsPerEok: Math.round(ratio * 100) / 100,
    tone: ratio >= 1 ? "good" : ratio > 0 ? "warn" : "muted",
    // 등록특허 전체 기준(NTIS 산출 특허만 분리 불가) + 성과는 과제 종료 후 발생 → 시차 존재
    note: "누적 등록특허 기준 · 성과 시차 존재",
  };
}

/** R&D 축 외부 신호를 한 번에 해석. mode에 따라 mock/live 어댑터를 탄다. */
export function resolveTechExternalSignals(company: Company): TechExternalSignals {
  // live 모드는 사업자번호 기반 API 어댑터 연결 지점(미구현) — 현재는 mock으로 폴백.
  return {
    source: EXTERNAL_MODE === "live" ? "live" : "mock",
    venture: deriveVenture(company),
    patentClass: derivePatentClass(company),
    govRnd: deriveGovRnd(company),
  };
}

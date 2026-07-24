import type { Company, SupportRecord } from "@/types";

export const DUPLICATE_RISK_THRESHOLD = 3; // CLAUDE.md 반복선정 규칙 기준(GROUP BY ... HAVING COUNT>=N). 실제 심사 가이드라인 재확인 필요.
export const DUPLICATE_RISK_WINDOW_YEARS = 3;

// 사업연도(support_programs.year, program-progress.ts의 companyProgramKeys가 쓰는 것과 동일 필드)를
// 우선 쓴다 — 선정일(date)이 다음 회계연도로 넘어가는 레코드가 있으면 date 기준 연도와 어긋날 수 있다.
export function recordYear(h: SupportRecord): number {
  return h.year ?? Number(h.date.slice(0, 4));
}

/** "최근 3년" 기준연도. 오늘 날짜(2026)가 아니라 데이터셋의 최신 지원이력 연도를 기준으로 삼는다
 *  — 샘플 지원이력은 2020~2024년뿐이라 오늘 날짜 기준 최근 3년으로 계산하면 표본이 전부 0건이 된다. */
export function latestSupportYear(companies: Company[]): number {
  let max = 0;
  for (const c of companies) {
    for (const h of c.supportHistory) {
      const y = recordYear(h);
      if (y > max) max = y;
    }
  }
  return max || new Date().getFullYear();
}

/**
 * 선정 단위 키 = (연도, 사업코드).
 *
 * ⚠️ 패키지지원은 **한 번 선정되고도 세부품목마다 행이 따로** 생긴다
 * (예: 1878 → 2024 B1_1_3 에서 시제품제작·컨설팅·특허지원 3행 = 실제로는 1건 선정).
 * 행을 세면 반복선정이 과대계상되므로(샘플 74개 조합 중 15건이 다행 패키지),
 * 중복·반복 판정은 반드시 이 키의 **고유 개수**로 센다.
 * 사업코드가 없는 레코드는 합칠 근거가 없으므로 각각 별건으로 둔다.
 */
function selectionKey(h: SupportRecord, idx: number): string {
  return h.programCode ? `${recordYear(h)}|${h.programCode}` : `__nocode_${idx}`;
}

/** 최근 N년(latestSupportYear 기준) 내 "선정"된 **사업 수**(패키지 세부품목은 1건으로 합산). */
export function recentSelectionCount(company: Company, latestYear: number, windowYears = DUPLICATE_RISK_WINDOW_YEARS): number {
  const from = latestYear - windowYears + 1;
  const keys = new Set<string>();
  company.supportHistory.forEach((h, i) => {
    if (h.result !== "선정") return;
    const y = recordYear(h);
    if (y < from || y > latestYear) return;
    keys.add(selectionKey(h, i));
  });
  return keys.size;
}

/** 최근 N년 내 지원 "항목수"(행 수 — 패키지 세부품목 포함). 근거 표시용, 판정엔 쓰지 않는다. */
export function recentSupportItemCount(company: Company, latestYear: number, windowYears = DUPLICATE_RISK_WINDOW_YEARS): number {
  const from = latestYear - windowYears + 1;
  return company.supportHistory.filter((h) => h.result === "선정" && recordYear(h) >= from && recordYear(h) <= latestYear).length;
}

export function isDuplicateRisk(company: Company, latestYear: number): boolean {
  return recentSelectionCount(company, latestYear) >= DUPLICATE_RISK_THRESHOLD;
}

export type RiskLevel = "낮음" | "보통" | "높음" | "매우높음";

/** 최근 3년 선정건수 → 위험도 등급(임의 구간, 실제 심사 가이드라인 확정 전 임시). */
export function riskLevel(count: number): RiskLevel {
  if (count >= 5) return "매우높음";
  if (count >= 3) return "높음";
  if (count >= 1) return "보통";
  return "낮음";
}

export const RISK_LEVEL_BADGE: Record<RiskLevel, "bad" | "warn" | "info" | "good"> = {
  매우높음: "bad",
  높음: "warn",
  보통: "info",
  낮음: "good",
};

/**
 * 한 번의 선정(= 사업 1건)과 그 안에서 받은 세부품목들.
 * 패키지지원은 선정 1건에 여러 품목(시제품제작·컨설팅·특허지원 …)이 딸려온다.
 */
export interface SelectionGroup {
  key: string;
  year: number;
  programCode: string | null;
  programName: string | null;
  bizType: string;
  result: SupportRecord["result"];
  /** 그룹 대표일 = 소속 항목 중 가장 이른 선정일 */
  date: string;
  /** 세부품목 합계 금액(천원) — 패키지 총 수령액 */
  totalAmount: number;
  /** 세부품목 원본 행들(신청 시점 순) */
  items: SupportRecord[];
}

/**
 * 지원이력을 **사업(선정) 단위로 묶는다** — 화면 목록과 선정건수를 일치시키기 위함.
 *
 * 행을 그대로 나열하면 패키지 1건이 3줄로 흩어져, 위에서 "1건 선정"이라 표시해놓고
 * 아래 목록엔 3줄이 보이는 모순이 생긴다(1878 사례).
 *
 * 결과(선정/탈락/포기)까지 키에 포함한다 — 같은 사업에서 일부 품목만 탈락한 경우를
 * 한 덩어리로 합치면 "선정된 건"과 "탈락한 건"이 뒤섞이기 때문.
 * 사업코드가 없는 행은 합칠 근거가 없어 각각 별건으로 둔다(선정건수 계산과 동일 규칙).
 */
export function groupBySelection(history: SupportRecord[]): SelectionGroup[] {
  const map = new Map<string, SelectionGroup>();
  history.forEach((h, i) => {
    const key = h.programCode
      ? `${recordYear(h)}|${h.programCode}|${h.result}`
      : `__nocode_${i}`;
    const g = map.get(key);
    if (g) {
      g.items.push(h);
      g.totalAmount += h.amount || 0;
      if (h.date < g.date) g.date = h.date;
    } else {
      map.set(key, {
        key,
        year: recordYear(h),
        programCode: h.programCode,
        programName: h.programName,
        bizType: h.bizType,
        result: h.result,
        date: h.date,
        totalAmount: h.amount || 0,
        items: [h],
      });
    }
  });
  // 최신 선정일 우선(타임라인 표시 순서)
  return [...map.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** 연도별 선정건수 맵 (최근 windowYears개년). 패키지 세부품목은 1건으로 합산. */
export function selectionsByYear(company: Company, latestYear: number, windowYears = DUPLICATE_RISK_WINDOW_YEARS) {
  const from = latestYear - windowYears + 1;
  const years = Array.from({ length: windowYears }, (_, i) => from + i);
  return years.map((year) => {
    const keys = new Set<string>();
    company.supportHistory.forEach((h, i) => {
      if (h.result === "선정" && recordYear(h) === year) keys.add(selectionKey(h, i));
    });
    return { year, count: keys.size };
  });
}

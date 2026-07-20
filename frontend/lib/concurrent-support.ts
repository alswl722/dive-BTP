// 동시 수혜 탐지 — "지금 다른 부서에서 받고 있나"
//
// 발제사가 지적한 문제: 부서별로 따로 심사해서 한 기업이 여러 부서 사업을 동시에
// 받아도 즉시 파악이 안 된다. 기존 '반복 수혜'(해마다 뽑히나)와는 다른 문제로,
// 이쪽은 **시점**이 겹치는지를 본다.
//
// 판정 3단계(EDA 검증 기준):
//   L1 기간 겹침       → 동시에 2건 이상 수행 중
//   L2 + 부서 다름      → 서로 다른 부서에서 동시 수혜  ★발제사 문제 정면
//   L3 + 지원 성격 동일 → 같은 성격 지원을 중복 수령    ★★실질적 중복
//
// ⚠️ 부서 판정은 사업코드 접두사를 근거로 한 **추정**이다. 실제 조직도와 대조하지
//    않았으므로 화면에서는 '사업군'으로 표기하고 확정 표현을 피한다.

import type { Company, SupportRecord } from "@/types";

export interface ConcurrentPair {
  a: SupportRecord;
  b: SupportRecord;
  /**
   * 사업군 비교가 가능한 쌍인가.
   * 2024년에 사업코드 체계가 개편돼(B1_311 → B1_1_3) **연도가 다르면 접두사가 달라도
   * 같은 부서일 수 있다.** 같은 연도일 때만 비교해야 과대 판정을 피한다.
   */
  deptComparable: boolean;
  /** 사업코드 접두사가 다름 = 다른 부서(추정). deptComparable일 때만 의미 있음 */
  crossDept: boolean;
  /** 지원 성격(사업유형)까지 동일 = 실질적 중복 */
  sameType: boolean;
}

/**
 * 사업코드 접두사 = 부서/사업군 추정 키.
 * 예: "B1_311" → "B1", "E2_1_8" → "E2"
 * ⚠️ 2024년 코드 체계가 개편돼(B1_311 → B1_1_3) 연도 간 비교에는 쓰지 않는다.
 */
export function deptKey(programCode: string | null): string | null {
  if (!programCode) return null;
  const m = /^([A-Za-z]+\d*)/.exec(programCode);
  return m ? m[1].toUpperCase() : null;
}

function overlaps(a: SupportRecord, b: SupportRecord): boolean {
  if (!a.startDate || !a.endDate || !b.startDate || !b.endDate) return false;
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

/** 선정 건 중 수행 기간이 겹치는 쌍을 찾는다. */
export function findConcurrentPairs(company: Company): ConcurrentPair[] {
  const selected = company.supportHistory.filter(
    (h) => h.result === "선정" && h.startDate && h.endDate
  );
  const pairs: ConcurrentPair[] = [];
  for (let i = 0; i < selected.length; i++) {
    for (let j = i + 1; j < selected.length; j++) {
      const a = selected[i];
      const b = selected[j];
      if (a.programCode && a.programCode === b.programCode) continue; // 같은 사업의 분할 행
      if (!overlaps(a, b)) continue;
      const da = deptKey(a.programCode);
      const db = deptKey(b.programCode);
      // 연도가 같아야 사업군(코드 접두사) 비교가 성립한다 — 2024년 체계 개편 때문.
      const deptComparable = da != null && db != null && a.year != null && a.year === b.year;
      pairs.push({
        a,
        b,
        deptComparable,
        crossDept: deptComparable && da !== db,
        sameType: a.bizType === b.bizType,
      });
    }
  }
  return pairs;
}

export interface ConcurrentSummary {
  total: number;       // 겹치는 쌍 전체
  crossDept: number;   // 그중 사업군이 다른 쌍 (같은 연도 = 비교 가능한 쌍만)
  sameType: number;    // 그중 지원 성격도 같은 쌍 = 실질적 중복
  /** 연도가 달라 사업군을 비교할 수 없는 쌍 — 판정 유보(과소 판정 가능성) */
  deptUnknown: number;
  /** 기간 정보가 없어 판정에서 빠진 선정 건수 — 과소 판정 가능성 표기용 */
  missingPeriod: number;
}

export function summarizeConcurrent(company: Company): ConcurrentSummary {
  const pairs = findConcurrentPairs(company);
  const selected = company.supportHistory.filter((h) => h.result === "선정");
  return {
    total: pairs.length,
    crossDept: pairs.filter((p) => p.crossDept).length,
    sameType: pairs.filter((p) => p.crossDept && p.sameType).length,
    deptUnknown: pairs.filter((p) => !p.deptComparable).length,
    missingPeriod: selected.filter((h) => !h.startDate || !h.endDate).length,
  };
}

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
import deptMapFile from "@/lib/data/program-dept-map.json";

const DEPT_MAP: Record<string, string> = (deptMapFile as { map: Record<string, string> }).map;
const CANONICAL_YEAR = 2024; // program-dept-map.json이 이 연도 코드 기준으로 부서를 뽑음(build_program_dept_map.py와 동일)

export interface ConcurrentPair {
  a: SupportRecord;
  b: SupportRecord;
  /**
   * 사업군 비교가 가능한 쌍인가.
   * 2024년에 사업코드 체계가 개편돼(B1_311 → B1_1_3) 접두사만으론 연도가 다르면
   * 비교가 안 됐지만, program-dept-map.json(사업명 기준 구→신 매핑, 정확매칭만
   * 채택 — backend/etl/build_program_dept_map.py)으로 풀리면 연도 달라도 비교한다.
   * 매핑에 없는 사업명은 기존처럼 같은 연도일 때만(원본 접두사로) 비교한다.
   */
  deptComparable: boolean;
  /** 부서가 다름(추정). deptComparable일 때만 의미 있음 */
  crossDept: boolean;
  /** 지원 성격(사업유형)까지 동일 = 실질적 중복 */
  sameType: boolean;
}

/**
 * 사업코드 접두사 = 부서/사업군 추정 키.
 * 예: "B1_311" → "B1", "E2_1_8" → "E2"
 * ⚠️ 2024년 코드 체계가 개편돼(B1_311 → B1_1_3) **같은 연도끼리 비교할 때만** 이 값을
 * 직접 써야 한다. 연도가 다르면 resolveDept()를 대신 쓸 것.
 */
export function deptKey(programCode: string | null): string | null {
  if (!programCode) return null;
  const m = /^([A-Za-z]+\d*)/.exec(programCode);
  return m ? m[1].toUpperCase() : null;
}

/**
 * 사업명 정규화 — build_program_dept_map.py의 norm_name()과 반드시 동일하게 유지.
 * (공백·괄호·하이픈·언더스코어·쉼표·가운뎃점 제거, 대소문자·㈜ 표기 통일)
 */
function normProgramName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s()\-_,·]/g, "")
    .replace(/&/g, "＆")
    .replace(/㈜/g, "주")
    .replace(/\(주\)/g, "주");
}

/**
 * 레코드의 "2024년 기준 캐노니컬 부서"를 구한다.
 * - 2024년 레코드면 코드 접두사 그대로(이미 신 체계).
 * - 그 이전 연도면 사업명으로 program-dept-map.json을 찾아본다 — 있으면 연도 경계를
 *   넘어 비교 가능(resolveDept가 null 아닌 값을 반환). 매핑에 없으면 null — 호출부가
 *   같은 연도 raw 접두사 비교로 폴백한다(과대 판정 방지, 억지 추정 안 함).
 */
function resolveDept(programCode: string | null, programName: string | null, year: number | null): string | null {
  if (year === CANONICAL_YEAR) return deptKey(programCode);
  if (!programName) return null;
  return DEPT_MAP[normProgramName(programName)] ?? null;
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

      // 1순위: 사업명 매핑으로 "2024년 기준 캐노니컬 부서"가 둘 다 풀리면 연도 무관 비교.
      const resolvedA = resolveDept(a.programCode, a.programName, a.year);
      const resolvedB = resolveDept(b.programCode, b.programName, b.year);
      let deptComparable: boolean;
      let crossDept: boolean;
      if (resolvedA != null && resolvedB != null) {
        deptComparable = true;
        crossDept = resolvedA !== resolvedB;
      } else {
        // 폴백: 매핑에 없는 사업명 — 같은 연도일 때만 원본 접두사로 비교(기존 동작 유지).
        const rawA = deptKey(a.programCode);
        const rawB = deptKey(b.programCode);
        deptComparable = rawA != null && rawB != null && a.year != null && a.year === b.year;
        crossDept = deptComparable && rawA !== rawB;
      }
      pairs.push({
        a,
        b,
        deptComparable,
        crossDept,
        sameType: a.bizType === b.bizType,
      });
    }
  }
  return pairs;
}

export interface ConcurrentSummary {
  total: number;       // 겹치는 쌍 전체
  crossDept: number;   // 그중 부서가 다른 쌍 (비교 가능한 쌍만)
  /** 부서가 다르면서 지원 성격도 같은 쌍 = 실질적 중복.
   *  ConcurrentPair.sameType(성격 일치만)과 조건이 다르므로 이름을 구분한다. */
  crossDeptSameType: number;
  /** 사업명 매핑도 없고 연도도 달라 부서를 비교할 수 없는 쌍 — 판정 유보(과소 판정 가능성).
   *  program-dept-map.json 커버리지(72.8%) 밖의 사업이거나 진짜 신규 사업. */
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
    crossDeptSameType: pairs.filter((p) => p.crossDept && p.sameType).length,
    deptUnknown: pairs.filter((p) => !p.deptComparable).length,
    missingPeriod: selected.filter((h) => !h.startDate || !h.endDate).length,
  };
}

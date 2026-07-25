// 리포트 공용 타입·값 포맷터 — 배치 리포트(company-report), 편집 빌더 블록(report-blocks),
// 렌더러(export/pdf)가 모두 여기서 가져다 쓴다.
//
// 원래는 ReportSection·Cell이 export.ts / company-report.ts / report-blocks.ts에 각각
// 선언돼 있었고 gov()는 두 파일에 글자 그대로 복붙돼 있었다. 리포트와 화면이 같은 값을
// 보여줘야 하는 이상 포맷터가 갈라지면 안 되므로 단일 출처로 모은다.

import { formatKRW } from "@/lib/utils";

/** 표 한 칸. null/undefined는 렌더 단계에서 "-" 또는 빈칸으로 처리된다. */
export type Cell = string | number | null | undefined;

/** 리포트 한 섹션 — 제목 + (라벨, 값) 행. PDF·인쇄·Word·CSV가 공통으로 소비한다. */
export interface ReportSection {
  heading: string;
  rows: [string, Cell][];
}

export const scoreOr = (v: number | null | undefined) => (v == null ? "-" : `${Math.round(v)}점`);

/** 비율 → 소수 첫째자리 %. 재무 지표처럼 미세한 차이가 의미 있는 값에 쓴다. */
export const ratioPct = (v: number | null | undefined) => (v == null ? "-" : `${(v * 100).toFixed(1)}%`);

/** 비율 → 정수 %. 전환율·집중도처럼 자릿수를 늘려도 판단이 달라지지 않는 값에 쓴다. */
export const roundPct = (v: number | null | undefined) => (v == null ? "-" : `${Math.round(v * 100)}%`);

export const yesNo = (v: boolean | null | undefined) => (v ? "예" : "아니오");

/** 정부연구비 단위는 '원' → 천원으로 맞춰 formatKRW 재사용. (CLAUDE.md 단위 불일치 이슈) */
export const gov = (won: number | null | undefined) => (won == null ? "-" : won === 0 ? "0원" : formatKRW(won / 1000));

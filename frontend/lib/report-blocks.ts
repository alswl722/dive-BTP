// 리포트 편집 — 블록 id → 깔끔한 데이터(표) 정의. 캡처(스크린샷) 대신 원본 데이터로 렌더한다.
// 차트 블록만 kind="chart"(이미지 캡처), 나머지는 kind="data"(네이티브 표 → PDF/Word/CSV).
// Selectable(wrap)의 id와 여기 키가 1:1로 맞아야 한다.

import type { Company } from "@/types";
import { formatKRW } from "@/lib/utils";
import { resolveTechExternalSignals } from "@/lib/external-data";

export type Cell = string | number;
export interface BlockSection {
  heading: string;
  rows: [string, Cell][];
}
export type BlockDef =
  | { kind: "data"; label: string; data: (c: Company) => BlockSection }
  | { kind: "chart"; label: string };

const pct = (v: number | null | undefined) => (v == null ? "-" : `${Math.round(v * 100)}%`);
const gov = (won: number | null | undefined) => (won == null ? "-" : won === 0 ? "0원" : formatKRW(won / 1000));

export const REPORT_BLOCKS: Record<string, BlockDef> = {
  // 개요
  "ov-composite": { kind: "chart", label: "종합점수" },
  "ov-stats": {
    kind: "data",
    label: "핵심 지표",
    data: (c) => ({
      heading: "핵심 지표",
      rows: [
        ["최근 매출", formatKRW(c.revenueLatest)],
        ["누적 지원금", `${formatKRW(c.support.총지원금_천원)} (${c.support.건수 ?? 0}건)`],
        ["1인당 평균급여", formatKRW(c.avgSalaryLatest)],
        ["마지막 선정연도", c.supportHistory.filter((h) => h.result === "선정").map((h) => h.date.slice(0, 4)).sort().at(-1) ?? "-"],
      ],
    }),
  },
  "ov-certs": {
    kind: "data",
    label: "보유 인증",
    data: (c) => ({
      heading: "보유 인증",
      rows: Object.entries(c.certifications).map(([k, has]) => [k, has ? "보유" : "미보유"]),
    }),
  },
  "ov-tech-stats": {
    kind: "data",
    label: "특허·NTIS·지원 이력",
    data: (c) => ({
      heading: "특허·NTIS·지원 이력",
      rows: [
        ["특허 (등록/출원)", `${c.patents.등록 ?? 0} / ${c.patents.출원 ?? 0}`],
        ["NTIS (주관/위탁)", `${c.ntis.주관 ?? 0} / ${c.ntis.위탁 ?? 0}`],
        ["지원 이력", `${c.support.건수 ?? 0}건 · ${c.support.지원연도수 ?? 0}개년`],
      ],
    }),
  },
  "ov-fit": {
    kind: "data",
    label: "사업정체성 정합성",
    data: (c) => {
      const f = c.businessFit;
      if (!f) return { heading: "사업정체성 정합성", rows: [["판정", "데이터 없음"]] };
      const b = f.breakdown;
      return {
        heading: "사업정체성 정합성",
        rows: [
          ["정합성 판정", `${f.matchType}${f.score != null ? ` · ${f.score.toFixed(0)}/100` : ""}`],
          ["요약", f.summary || "-"],
          ["분포(직접/간접/무관/유보)", `${b.직접일치 ?? 0} / ${b.간접관련 ?? 0} / ${b.무관 ?? 0} / ${b.판단유보 ?? 0}`],
          ["판정 완료 / 대기", `${f.totalJudged} / ${f.totalPending}`],
        ],
      };
    },
  },
  // R&D
  "rnd-domain": {
    kind: "data",
    label: "기술 분야",
    data: (c) => {
      const d = c.tech?.domain;
      return {
        heading: "기술 분야",
        rows: d
          ? [
              ["주력 기술분야", `${d.주력기술분야 ?? "-"}${d.기술수준등급 ? ` · ${d.기술수준등급}` : ""}`],
              ["국가전략기술", d.국가전략기술.length ? d.국가전략기술.join(", ") : "-"],
              ["분야 수 / 집중도", `${d.분야수 ?? 0}개 · ${d.집중도 != null ? Math.round(d.집중도 * 100) + "%" : "-"}`],
            ]
          : [["기술 분야", "데이터 없음"]],
      };
    },
  },
  "rnd-external": {
    kind: "data",
    label: "외부 공공데이터(목업)",
    data: (c) => {
      const s = resolveTechExternalSignals(c);
      const rows: [string, Cell][] = [["벤처확인 유형", s.venture.type]];
      if (s.patentClass) rows.push(["특허 기술분류 집중도", `${s.patentClass.concentration}% (${s.patentClass.tone === "good" ? "전문형" : "분산형"})`]);
      if (s.govRnd && s.govRnd.patentsPerEok != null) rows.push(["정부지원 대비 성과", `${s.govRnd.patentsPerEok} 건/억원`]);
      return { heading: "외부 공공데이터(목업)", rows };
    },
  },
  "rnd-patent": {
    kind: "data",
    label: "특허 실적",
    data: (c) => {
      const t = c.tech;
      return {
        heading: "특허 실적",
        rows: t
          ? [
              ["등록 / 출원", `${t.patents.등록 ?? 0} / ${t.patents.출원 ?? 0}`],
              ["등록 전환율", pct(t.patents.등록전환율)],
              ["최근 3년 출원", `${t.patents.최근3년출원 ?? 0}건`],
              ["개인명의 등록특허", `${t.patents.대표개인명의_등록 ?? 0}건`],
              ["권리 소멸률", pct(t.patents.소멸률)],
              ["활동 공백", t.patents.활동공백년수 != null ? `${t.patents.활동공백년수.toFixed(1)}년` : "-"],
            ]
          : [["특허", "데이터 없음"]],
      };
    },
  },
  "rnd-gov": {
    kind: "data",
    label: "정부 R&D · 투자",
    data: (c) => {
      const t = c.tech;
      return {
        heading: "정부 R&D · 투자",
        rows: t
          ? [
              ["NTIS 주관 / 위탁", `${t.ntis.주관과제수 ?? 0} / ${t.ntis.위탁과제수 ?? 0}건`],
              ["누적 정부연구비", gov(t.ntis.정부연구비_원)],
              ["민간부담률", t.ntis.민간부담률 != null ? pct(t.ntis.민간부담률) : "정부R&D 없음"],
              ["진행중 / 최근수주", `${t.ntis.진행중과제수 ?? 0}건 · ${t.ntis.최근수주연도 ?? "-"}`],
              ["R&D 집약도", pct(t.rnd.집약도)],
            ]
          : [["정부 R&D", "데이터 없음"]],
      };
    },
  },
  "rnd-cert": {
    kind: "data",
    label: "인증 취득현황",
    data: (c) => ({
      heading: "인증 취득현황",
      rows: [
        ...Object.entries(c.certifications).map(([k, has]) => [k, has ? "보유" : "미보유"] as [string, Cell]),
        ...(c.tech?.certification.실체괴리 ? [["서류 vs 실체", "불일치"] as [string, Cell]] : []),
      ],
    }),
  },
  // 재무 — 차트/복합 블록은 이미지 캡처
  "fin-radar": { kind: "chart", label: "업종 평균 대비(레이더)" },
  "fin-axes": { kind: "chart", label: "재무 4축" },
  "fin-drill": { kind: "chart", label: "재무 세부지표" },
  // 고용
  "emp-scale": { kind: "chart", label: "인력 규모·변화" },
  "emp-salary": { kind: "chart", label: "처우·급여 수준" },
  "emp-productivity": { kind: "chart", label: "인력 생산성" },
  "emp-stability": { kind: "chart", label: "인력 안정성" },
  // 중복수혜
  "dup-flag": { kind: "chart", label: "반복지원 판정" },
  "dup-recent": { kind: "chart", label: "최근 선정 분석" },
  "dup-history": { kind: "chart", label: "전체 지원이력" },
  // 사업정체성
  "bf-summary": { kind: "chart", label: "정합성 종합 판정" },
  "bf-detail": { kind: "chart", label: "정합성 판정 상세" },
};

/** 리포트 최종 아이템 — 데이터 섹션 또는 캡처 이미지(차트). PDF/Word/미리보기 공통. */
export type ReportItem =
  | { type: "section"; section: BlockSection }
  | { type: "image"; label: string; dataUrl: string; w: number; h: number };

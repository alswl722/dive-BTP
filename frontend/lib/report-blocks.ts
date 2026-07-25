// 리포트 편집 — 블록 id → 깔끔한 데이터(표) 정의. 캡처(스크린샷) 대신 원본 데이터로 렌더한다.
// 차트 블록만 kind="chart"(이미지 캡처), 나머지는 kind="data"(네이티브 표 → PDF/Word/CSV).
//
// 이 객체가 블록의 단일 출처다 — Selectable은 id만 받고 라벨·종류를 여기서 읽는다.
// 타입 주석 대신 satisfies를 쓰는 이유: Record<string, _>로 좁히면 키 리터럴이 사라져
// BlockId가 그냥 string이 되고, Selectable의 id 오타를 컴파일 타임에 못 잡는다.
//
// "전체 담기"는 여기 등록된 블록만 담는다. 화면에 보이지만 일부러 뺀 것 —
//  · R&D 탭 하단 dataQuality 경고: 데이터 품질 메타 정보라 심사 리포트 본문이 아니다
//  · 사업정체성 탭 "판정 대기" 알림: 스크립트 실행 안내(액션 유도)라 저장물에 남길 내용이 아니다
// 조건부로 null을 반환하는 블록(AxisSignals·RiskGate·TechWarnings·PatentDrilldown·
// ConcurrentPanel)은 Selectable을 컴포넌트 안쪽 널 가드 뒤에 둔다 — 밖에서 감싸면
// 내용이 없을 때 빈 체크박스 상자만 남는다.

import type { Company } from "@/types";
import { formatKRW } from "@/lib/utils";
import { resolveTechExternalSignals } from "@/lib/external-data";
import { gov, roundPct as pct, type Cell, type ReportSection } from "@/lib/report-format";

export type BlockDef =
  | { kind: "data"; label: string; data: (c: Company) => ReportSection }
  | { kind: "chart"; label: string };

export const REPORT_BLOCKS = {
  // 탭 밖 상단 — 개요 탭 해체로 승격된 블록. 어느 탭에서든 항상 담을 수 있다.
  composite: { kind: "chart", label: "종합점수" },
  // 축별 심사 신호(AxisSignals) — 탭마다 하나씩. 신호가 없는 축은 렌더 자체가 안 돼 목록에 안 뜬다.
  "sig-재무": { kind: "chart", label: "심사 신호 · 재무" },
  "sig-R&D": { kind: "chart", label: "심사 신호 · R&D" },
  "sig-고용": { kind: "chart", label: "심사 신호 · 고용" },
  "sig-중복수혜": { kind: "chart", label: "심사 신호 · 중복수혜" },
  "sig-사업정체성": { kind: "chart", label: "심사 신호 · 사업정체성" },
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
  "rnd-warnings": { kind: "chart", label: "기술축 경고" },
  "rnd-patent-list": { kind: "chart", label: "특허 목록(상세)" },
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
  "fin-stats": {
    kind: "data",
    label: "핵심 재무지표",
    data: (c) => ({
      heading: "핵심 재무지표",
      rows: [
        ["최근 매출", formatKRW(c.revenueLatest)],
        ["누적 지원금", `${formatKRW(c.support.총지원금_천원)} (${c.support.건수 ?? 0}건)`],
        ["1인당 평균급여", formatKRW(c.avgSalaryLatest)],
      ],
    }),
  },
  "fin-trend": { kind: "chart", label: "재무 추세(자산·매출·영업이익)" },
  "fin-risk": { kind: "chart", label: "재무 리스크 게이트" },
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
  "dup-concurrent": { kind: "chart", label: "동시 수행 지원(기간 겹침)" },
  "dup-recent": { kind: "chart", label: "최근 선정 분석" },
  "dup-history": { kind: "chart", label: "전체 지원이력" },
  // 사업정체성
  "bf-summary": { kind: "chart", label: "정합성 종합 판정" },
  "bf-detail": { kind: "chart", label: "정합성 판정 상세" },
} satisfies Record<string, BlockDef>;

/** Selectable에 넘길 수 있는 블록 id — 레지스트리 키에서 파생돼 오타가 컴파일 에러가 된다. */
export type BlockId = keyof typeof REPORT_BLOCKS;

/** 리포트 최종 아이템 — 데이터 섹션 또는 캡처 이미지(차트). PDF/Word/미리보기 공통. */
export type ReportItem =
  | { type: "section"; section: ReportSection }
  | { type: "image"; label: string; dataUrl: string; w: number; h: number };

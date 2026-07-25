// 기업 리포트 데이터 빌더 — 단건(상세 내보내기)·배치(여러 기업)에서 공유.
// PDF/인쇄(섹션형)와 엑셀(가로 1행)이 같은 소스를 쓰도록 순수 함수로 분리.
//
// 상세페이지 6개 탭(개요·재무·R&D·사업정체성·지원이력·중복수혜)의 심사 핵심을
// 기업 1개당 1페이지에 압축한다. 화면에서 쓰는 파생값(건전성·중복위험)은 동일 헬퍼를
// 재사용해 리포트와 화면이 어긋나지 않게 한다.

import type { Company, ReviewStatus } from "@/types";
import { resolveOverallScore, techGroupScore } from "@/lib/scoring";
import { deriveRiskGrade } from "@/lib/review-summary";
import { recentSelectionCount, riskLevel, DUPLICATE_RISK_WINDOW_YEARS } from "@/lib/duplicate-risk";
import { formatKRW } from "@/lib/utils";
import { gov, ratioPct, roundPct, scoreOr, yesNo, type Cell, type ReportSection } from "@/lib/report-format";

/** 설립일(YYYY-MM-DD) → 업력(년). 기준연도는 데이터 최신연도(latestYear). */
function bizAge(foundedDate: string | null, latestYear: number): string {
  if (!foundedDate) return "-";
  const y = Number(foundedDate.slice(0, 4));
  if (!Number.isFinite(y)) return "-";
  const age = latestYear - y;
  return age >= 0 ? `${age}년` : "-";
}

/** 매출 5개년 추세 요약 — 첫·마지막 관측치. */
function revenueTrend(company: Company): string {
  const pts = (company.trends["매출액"] ?? []).filter((p) => p.value != null) as { year: number; value: number }[];
  if (pts.length < 2) return "-";
  const a = pts[0];
  const b = pts[pts.length - 1];
  return `${a.year} ${formatKRW(a.value)} → ${b.year} ${formatKRW(b.value)}`;
}

/** 보유 인증명만 나열. */
function heldCerts(company: Company): string {
  const held = Object.entries(company.certifications ?? {}).filter(([, v]) => v).map(([k]) => k);
  return held.length ? held.join(", ") : "없음";
}

/** PDF/인쇄 리포트용 — 상세페이지 핵심을 6~7개 섹션(라벨/값)으로. 심사 결정이 있으면 맨 앞. */
export function companySections(
  company: Company,
  latestYear: number,
  decision?: { status: ReviewStatus; reason: string }
): ReportSection[] {
  const s = company.scores;
  const t = company.tech;
  const raw = company.rawMetrics ?? {};
  const fit = company.businessFit;
  const flag = company.duplicateFlag;
  const risk = deriveRiskGrade(company, latestYear);
  const dupCount = recentSelectionCount(company, latestYear);

  const sections: ReportSection[] = [];

  // 1) 기업 개요
  sections.push({
    heading: "기업 개요",
    rows: [
      ["업종", `${company.industry ?? "-"}${company.industryCode ? ` (${company.industryCode})` : ""}`],
      ["지역", company.region ?? "-"],
      ["설립일 · 업력", `${company.foundedDate ?? "-"} · ${bizAge(company.foundedDate, latestYear)}`],
      ["자본금", company.capitalThousand != null ? formatKRW(company.capitalThousand) : "-"],
      ["기업상태", company.isClosed ? company.closureType ?? "휴·폐업" : company.companyStatus ?? "정상"],
      ["종합점수", scoreOr(resolveOverallScore(company))],
      ["건전성 등급", `${risk.grade}${risk.reasons[0] ? ` — ${risk.reasons[0]}` : ""}`],
      ["데이터 결측", company.dataQuality?.missing?.length ? `${company.dataQuality.missing.length}건 (${company.dataQuality.missing.join(", ")})` : "없음"],
    ],
  });

  // 2) 재무 — 4축 점수 + 서류 검증용 핵심 원값
  sections.push({
    heading: "재무 (4축 · 업종 내 백분위)",
    rows: [
      ["성장성 / 수익성", `${scoreOr(s.성장성)} / ${scoreOr(s.수익성)}`],
      ["효율성 / 안정성", `${scoreOr(s.효율성)} / ${scoreOr(s.안정성)}`],
      ["최근 매출", formatKRW(company.revenueLatest)],
      ["매출 추세", revenueTrend(company)],
      ["부채비율 / 자기자본비율", `${ratioPct(raw["부채비율_최근"])} / ${ratioPct(raw["자기자본비율"])}`],
      ["영업이익률", ratioPct(raw["영업이익률_최근"])],
      ["총자산회전율", raw["총자산회전율"] != null ? `${raw["총자산회전율"].toFixed(2)}회` : "-"],
      ["자본잠식", yesNo(company.passthrough?.자본잠식_플래그 === 1)],
    ],
  });

  // 3) 기술 · R&D — 특허/정부R&D/인증/기술분야
  sections.push({
    heading: "기술 · R&D",
    rows: t
      ? [
          ["기술 점수 (R&D+NTIS)", scoreOr(techGroupScore(company))],
          ["주력 기술분야", `${t.domain.주력기술분야 ?? "-"}${t.domain.기술수준등급 ? ` · ${t.domain.기술수준등급}` : ""}`],
          ["국가전략기술", t.domain.국가전략기술.length ? t.domain.국가전략기술.join(", ") : "-"],
          ["특허 등록 / 출원", `${t.patents.등록 ?? 0}건 / ${t.patents.출원 ?? 0}건 (전환율 ${roundPct(t.patents.등록전환율)})`],
          ["최근3년 출원 / 활동공백", `${t.patents.최근3년출원 ?? 0}건 / ${t.patents.활동공백년수 != null ? `${t.patents.활동공백년수.toFixed(1)}년` : "-"}`],
          ["개인명의 등록특허 / 소멸률", `${t.patents.대표개인명의_등록 ?? 0}건 / ${roundPct(t.patents.소멸률)}`],
          ["정부 R&D (주관/위탁)", `${t.ntis.주관과제수 ?? 0}건 / ${t.ntis.위탁과제수 ?? 0}건`],
          ["누적 정부연구비 / 민간부담률", `${gov(t.ntis.정부연구비_원)} / ${t.ntis.민간부담률 != null ? roundPct(t.ntis.민간부담률) : "정부R&D 없음"}`],
          ["진행중 정부과제 / 최근수주", `${t.ntis.진행중과제수 ?? 0}건 / ${t.ntis.최근수주연도 ?? "-"}`],
          ["보유 인증", `${heldCerts(company)}${t.certification.실체괴리 ? " · ⚠ 서류-실체 불일치" : ""}`],
        ]
      : [["기술 데이터", "없음"], ["보유 인증", heldCerts(company)]],
  });

  // 4) 사업정체성 정합성(축8)
  if (fit) {
    const bd = fit.breakdown;
    sections.push({
      heading: "사업정체성 정합성",
      rows: [
        ["정합성 판정", `${fit.matchType}${fit.score != null ? ` · ${fit.score.toFixed(0)}/100` : ""}`],
        ["요약", fit.summary || "-"],
        ["분포(직접/간접/무관/유보)", `${bd.직접일치 ?? 0} / ${bd.간접관련 ?? 0} / ${bd.무관 ?? 0} / ${bd.판단유보 ?? 0}`],
        ["판정 완료 / 대기", `${fit.totalJudged}건 / ${fit.totalPending}건`],
      ],
    });
  }

  // 5) 지원 이력 & 중복수혜(축9)
  const historyRows: [string, Cell][] = [
    ["지원 건수 / 연도수", `${company.support.건수 ?? 0}건 / ${company.support.지원연도수 ?? 0}개년`],
    ["누적 지원금", formatKRW(company.support.총지원금_천원)],
    [`최근 ${DUPLICATE_RISK_WINDOW_YEARS}년 선정`, `${dupCount}건 (중복위험 ${riskLevel(dupCount)})`],
    ["반복지원 판정", flag ? `${flag.label}${flag.segment ? ` · ${flag.segment}` : ""} · 최다연속 ${flag.maxConsecutiveYears}년` : "-"],
  ];
  // 최근 이력 타임라인(선정+탈락+포기) — 최신순 최대 6건
  const recent = [...company.supportHistory].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
  recent.forEach((r) => {
    historyRows.push([r.date, `${r.result} · ${r.bizType}${r.amount > 0 ? ` · ${formatKRW(r.amount)}` : ""}`]);
  });
  if (company.supportHistory.length > 6) {
    historyRows.push(["", `… 외 ${company.supportHistory.length - 6}건`]);
  }
  sections.push({ heading: "지원 이력 · 중복수혜", rows: historyRows });

  // 0) 심사 결정 — 있으면 맨 앞
  if (decision && (decision.status === "선정" || decision.status === "제외")) {
    sections.unshift({
      heading: "심사 결정",
      rows: [
        ["결정", decision.status],
        ["사유", decision.reason || "-"],
      ],
    });
  }
  return sections;
}

/** 엑셀(가로 1행)용 헤더 — companyWideRow와 순서 일치. */
export const COMPANY_WIDE_HEADERS = [
  "기업", "업종", "업종코드", "지역", "설립일", "업력", "자본금", "기업상태", "종합점수", "건전성",
  "성장성", "수익성", "효율성", "안정성", "최근매출", "부채비율", "자기자본비율", "영업이익률", "총자산회전율", "자본잠식",
  "기술점수", "주력기술분야", "기술수준", "국가전략기술", "등록특허", "출원특허", "등록전환율", "최근3년출원", "개인명의특허", "특허소멸률", "활동공백년수",
  "NTIS주관", "NTIS위탁", "정부연구비", "민간부담률", "진행중과제", "최근수주연도", "보유인증", "실체괴리",
  "정합성판정", "정합성점수", "정합성_직접", "정합성_간접", "정합성_무관", "정합성_유보",
  "지원건수", "누적지원금", "지원연도수", "최근3년선정", "중복위험", "반복지원", "심사상태", "사유",
];

/** 엑셀용 — 기업 1개 = 1행(모든 지표 가로). 심사상태·사유는 있으면 채운다. */
export function companyWideRow(
  company: Company,
  latestYear: number,
  decision?: { status: ReviewStatus; reason: string }
): Cell[] {
  const s = company.scores;
  const t = company.tech;
  const raw = company.rawMetrics ?? {};
  const fit = company.businessFit;
  const flag = company.duplicateFlag;
  const risk = deriveRiskGrade(company, latestYear);
  const dupCount = recentSelectionCount(company, latestYear);
  const roundOr = (v: number | null | undefined) => (v == null ? "-" : Math.round(v));
  const bd = fit?.breakdown;

  return [
    company.name,
    company.industry ?? "-",
    company.industryCode ?? "-",
    company.region ?? "-",
    company.foundedDate ?? "-",
    bizAge(company.foundedDate, latestYear),
    company.capitalThousand != null ? formatKRW(company.capitalThousand) : "-",
    company.isClosed ? company.closureType ?? "휴·폐업" : company.companyStatus ?? "정상",
    roundOr(resolveOverallScore(company)),
    risk.grade,
    roundOr(s.성장성), roundOr(s.수익성), roundOr(s.효율성), roundOr(s.안정성),
    formatKRW(company.revenueLatest),
    ratioPct(raw["부채비율_최근"]), ratioPct(raw["자기자본비율"]), ratioPct(raw["영업이익률_최근"]),
    raw["총자산회전율"] != null ? `${raw["총자산회전율"].toFixed(2)}회` : "-",
    yesNo(company.passthrough?.자본잠식_플래그 === 1),
    roundOr(techGroupScore(company)),
    t?.domain.주력기술분야 ?? "-",
    t?.domain.기술수준등급 ?? "-",
    t && t.domain.국가전략기술.length ? t.domain.국가전략기술.join("; ") : "-",
    t ? t.patents.등록 ?? 0 : "-",
    t ? t.patents.출원 ?? 0 : "-",
    t ? roundPct(t.patents.등록전환율) : "-",
    t ? t.patents.최근3년출원 ?? 0 : "-",
    t ? t.patents.대표개인명의_등록 ?? 0 : "-",
    t ? roundPct(t.patents.소멸률) : "-",
    t && t.patents.활동공백년수 != null ? `${t.patents.활동공백년수.toFixed(1)}년` : "-",
    t ? t.ntis.주관과제수 ?? 0 : "-",
    t ? t.ntis.위탁과제수 ?? 0 : "-",
    t ? gov(t.ntis.정부연구비_원) : "-",
    t ? (t.ntis.민간부담률 != null ? roundPct(t.ntis.민간부담률) : "-") : "-",
    t ? t.ntis.진행중과제수 ?? 0 : "-",
    t?.ntis.최근수주연도 ?? "-",
    heldCerts(company),
    t ? yesNo(t.certification.실체괴리) : "-",
    fit?.matchType ?? "-",
    fit?.score != null ? fit.score.toFixed(0) : "-",
    bd?.직접일치 ?? "-", bd?.간접관련 ?? "-", bd?.무관 ?? "-", bd?.판단유보 ?? "-",
    company.support.건수 ?? 0,
    formatKRW(company.support.총지원금_천원),
    company.support.지원연도수 ?? 0,
    `${dupCount}건`,
    riskLevel(dupCount),
    flag ? `${flag.label}${flag.segment ? `/${flag.segment}` : ""}` : "-",
    decision?.status ?? "-",
    decision?.reason ?? "",
  ];
}

// 심사 요약 — 흩어진 축별 신호를 한곳에 모은다.
//
// 배경: 재무·기술·이력·정합성 신호가 6개 탭에 흩어져 있어, 담당자가 탭을 다 열어보지
// 않으면 위험 신호를 놓친다. 여기서 전 축을 훑어 (1) 축별 한 줄 결론 (2) 심각도순
// 통합 경고를 만든다. 판단은 대신하지 않고 근거만 제시한다(도구 원칙).
//
// ⚠️ 절대 임계값은 최소화하고 상대 점수(백분위)를 우선 사용. 부득이한 절대 기준은
// 상수로 뽑아 근거를 주석에 남긴다.

import { AXES, type Company } from "@/types";
import { axisSpread, AXIS_MISALIGNMENT_THRESHOLD } from "@/lib/scoring";
import { recentSelectionCount, DUPLICATE_RISK_THRESHOLD, DUPLICATE_RISK_WINDOW_YEARS } from "@/lib/duplicate-risk";
import { summarizeConcurrent } from "@/lib/concurrent-support";

export type Severity = "위험" | "주의" | "정보";
/** 요약 줄이 가리키는 탭 — 클릭 시 해당 탭으로 이동 */
export type AxisKey = "재무" | "R&D" | "지원이력" | "중복수혜" | "사업정체성";

export interface ReviewSignal {
  sev: Severity;
  axis: AxisKey;
  title: string;
  detail: string;
}

export interface AxisVerdict {
  axis: AxisKey;
  tone: "good" | "warn" | "bad" | "muted";
  headline: string;
  detail: string | null;
}

/** 점수 하위 판정선 — 백분위 기준(절대값 아님). */
const LOW_PERCENTILE = 25;
const HIGH_PERCENTILE = 65;
/**
 * 특허 관련 절대 임계값 — **이 파일이 단일 출처**다.
 * 화면(rnd-tab)과 요약이 같은 기준으로 판정해야 서로 어긋나지 않으므로 export한다.
 */
export const STALE_PATENT_YEARS = 3;   // 마지막 출원 이후 이만큼 지나면 R&D 정체
export const PATENT_LAPSE_ALERT = 0.1; // 등록 특허를 이 비율 이상 포기 = 유지 부담 신호

const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);

/** 전 축을 훑어 심각도순 신호 목록을 만든다. */
export function deriveReviewSignals(company: Company, latestYear: number): ReviewSignal[] {
  const out: ReviewSignal[] = [];
  const tech = company.tech;

  // --- 재무 ---
  if (company.passthrough.자본잠식_플래그 === 1) {
    out.push({
      sev: "위험", axis: "재무", title: "자본잠식",
      detail: "자본총계가 0 이하입니다. 최우선 확인이 필요한 재무 위험입니다.",
    });
  }
  const stab = company.scores.안정성;
  const debt = company.rawMetrics["부채비율_최근"];
  if (stab != null && stab < LOW_PERCENTILE) {
    out.push({
      sev: "위험", axis: "재무", title: "재무 안정성 하위",
      detail: debt != null
        ? `부채비율 ${debt.toFixed(1)}배 · 안정성 점수 ${Math.round(stab)}(업종 하위권).`
        : `안정성 점수 ${Math.round(stab)}(업종 하위권).`,
    });
  }
  const profitYears = company.rawMetrics["흑자지속성"];
  if (profitYears != null && profitYears <= 1) {
    out.push({
      sev: "주의", axis: "재무", title: "흑자 지속성 낮음",
      detail: `최근 5년 중 영업흑자 ${profitYears}년. 수익 안정성을 확인하세요.`,
    });
  }
  if (axisSpread(company.scores) >= AXIS_MISALIGNMENT_THRESHOLD) {
    const hi = AXES.reduce((a, b) => ((company.scores[b] ?? -1) > (company.scores[a] ?? -1) ? b : a));
    const lo = AXES.reduce((a, b) => ((company.scores[b] ?? 101) < (company.scores[a] ?? 101) ? b : a));
    out.push({
      sev: "주의", axis: "재무", title: "축 어긋남",
      detail: `${hi} ${Math.round(company.scores[hi] ?? 0)} ↔ ${lo} ${Math.round(company.scores[lo] ?? 0)}. 종합점수만 보면 오판할 수 있습니다.`,
    });
  }

  // --- 기술력 (원장 기반) ---
  if (tech?.certification.실체괴리) {
    out.push({
      sev: "위험", axis: "R&D", title: "인증 대비 실적 없음",
      detail: "핵심 인증을 보유했으나 등록 특허와 국가 R&D 실적이 모두 없습니다. 서류상 역량과 실제 실적이 어긋납니다.",
    });
  }
  const gap = tech?.patents.활동공백년수;
  if (gap != null && gap >= STALE_PATENT_YEARS) {
    out.push({
      sev: "주의", axis: "R&D", title: "최근 R&D 활동 없음",
      detail: `마지막 특허 출원 이후 ${gap.toFixed(1)}년 경과. 누적 실적은 있으나 현재 활동이 확인되지 않습니다.`,
    });
  }
  const lapse = tech?.patents.소멸률;
  if (lapse != null && lapse >= PATENT_LAPSE_ALERT) {
    out.push({
      sev: "주의", axis: "R&D", title: "특허 권리 소멸",
      detail: `등록 특허의 ${pct(lapse)}가 소멸 상태입니다. 연차료 미납 등 유지 부담 가능성을 확인하세요.`,
    });
  }

  // --- 지원이력 / 중복 ---
  const recent = recentSelectionCount(company, latestYear);
  if (recent >= DUPLICATE_RISK_THRESHOLD) {
    out.push({
      sev: "주의", axis: "중복수혜", title: "반복 수혜",
      detail: `최근 ${DUPLICATE_RISK_WINDOW_YEARS}년간 ${recent}회 선정. 중복수혜 가이드라인 검토가 필요합니다.`,
    });
  }
  if (company.duplicateFlag?.status === "flag") {
    out.push({
      sev: "위험", axis: "중복수혜", title: company.duplicateFlag.label,
      detail: "반복 수혜에도 성장 신호가 확인되지 않습니다.",
    });
  }
  // 동시 수혜 — 반복(해마다 뽑히나)과 다른 문제. 부서 분절로 담당자가 못 보던 지점.
  const conc = summarizeConcurrent(company);
  if (conc.sameType > 0) {
    out.push({
      sev: "위험", axis: "지원이력", title: "같은 성격 지원 동시 수령",
      detail: `수행 기간이 겹치는 ${conc.sameType}쌍이 서로 다른 사업군에서 같은 성격의 지원입니다. 중복 수혜 여부를 확인하세요.`,
    });
  } else if (conc.crossDept > 0) {
    out.push({
      sev: "주의", axis: "지원이력", title: "다른 사업군 동시 수행",
      detail: `수행 기간이 겹치는 지원 ${conc.crossDept}쌍이 서로 다른 사업군입니다.`,
    });
  }

  // --- 정합성 ---
  const fit = company.businessFit;
  if (fit && (fit.breakdown["무관"] ?? 0) > 0) {
    out.push({
      sev: "주의", axis: "사업정체성", title: "사업목적과 무관한 지원 이력",
      detail: `사업목적과 무관 판정 ${fit.breakdown["무관"]}건. 지원 적정성을 확인하세요.`,
    });
  }

  // --- 종합점수 캡 발동 (재무·기술·정합성 전 축 대상, docs/종합점수_설계노트.md §2) ---
  // 최저축이 종합점수를 실제로 끌어내린 경우에만 신호 — lowestAxis가 재무4축이면 위
  // "축 어긋남" 신호와 중복되므로 기술/정합성 축일 때만 별도 표시.
  const cs = company.compositeScore;
  if (cs?.rawWeightedAverage != null && cs.score != null && cs.rawWeightedAverage - cs.score > 0.5 && cs.lowestAxis) {
    const axisMap: Partial<Record<string, AxisKey>> = { "R&D특허": "R&D", NTIS: "R&D", 정합성: "사업정체성" };
    const target = axisMap[cs.lowestAxis];
    if (target) {
      out.push({
        sev: "주의", axis: target, title: `${cs.lowestAxis} 저점이 종합점수를 끌어내림`,
        detail: `${cs.lowestAxis} ${Math.round(cs.lowestAxisScore ?? 0)}점 때문에 종합점수가 ${Math.round(cs.rawWeightedAverage)}점에서 ${Math.round(cs.score)}점으로 조정됐습니다.`,
      });
    }
  }

  // --- 데이터 품질 ---
  if (!company.dataQuality.ok) {
    out.push({
      sev: "정보", axis: "재무", title: `재무지표 결측 ${company.dataQuality.missing.length}건`,
      detail: "일부 점수가 부분 데이터 기반으로 산출됐습니다.",
    });
  }
  if (company.percentileBasis === "전체fallback") {
    out.push({
      sev: "정보", axis: "재무", title: "동종업계 표본 부족",
      detail: "같은 업종 기업이 적어 전체 기업 대비 백분위로 계산했습니다.",
    });
  }
  if (tech?.domain.출처 === "KSIC추정") {
    out.push({
      sev: "정보", axis: "R&D", title: "기술분야는 업종 기반 추정",
      detail: "국가R&D 이력이 없어 업종코드로 추정한 값입니다.",
    });
  }

  const order: Record<Severity, number> = { 위험: 0, 주의: 1, 정보: 2 };
  return out.sort((a, b) => order[a.sev] - order[b.sev]);
}

/** 축별 한 줄 결론 — "그래서 이 축은 어떤가"를 탭을 열지 않고 알 수 있게. */
export function deriveAxisVerdicts(company: Company, latestYear: number): AxisVerdict[] {
  const tech = company.tech;
  const out: AxisVerdict[] = [];

  // 재무
  const finVals = AXES.map((a) => company.scores[a]).filter((v): v is number => v != null);
  const finAvg = finVals.length ? finVals.reduce((s, v) => s + v, 0) / finVals.length : null;
  const stab = company.scores.안정성;
  out.push({
    axis: "재무",
    tone: company.passthrough.자본잠식_플래그 === 1 || (stab != null && stab < LOW_PERCENTILE) ? "bad"
      : finAvg == null ? "muted" : finAvg >= HIGH_PERCENTILE ? "good" : finAvg < LOW_PERCENTILE ? "bad" : "warn",
    headline: finAvg == null ? "재무 데이터 없음" : `4축 평균 ${Math.round(finAvg)}점`,
    detail: axisSpread(company.scores) >= AXIS_MISALIGNMENT_THRESHOLD ? "축 간 격차 큼 — 개별 축 확인 필요" : null,
  });

  // 기술력
  if (tech) {
    const rp = tech.scores.rndPatent;
    const patents = tech.patents.등록 ?? 0;
    out.push({
      axis: "R&D",
      tone: tech.certification.실체괴리 ? "bad"
        : rp == null ? "muted" : rp >= HIGH_PERCENTILE ? "good" : rp < LOW_PERCENTILE ? "bad" : "warn",
      headline: `등록 특허 ${patents}건${rp != null ? ` · R&D 점수 ${Math.round(rp)}` : ""}`,
      detail: [
        tech.domain.주력기술분야,
        tech.domain.국가전략기술.length > 0 ? `국가전략기술 ${tech.domain.국가전략기술.join("·")}` : null,
      ].filter(Boolean).join(" · ") || null,
    });
  } else {
    out.push({ axis: "R&D", tone: "muted", headline: "기술 데이터 없음", detail: null });
  }

  // 지원이력
  const total = company.support.건수 ?? 0;
  const selected = company.supportHistory.filter((h) => h.result === "선정").length;
  const applied = company.supportHistory.length;
  out.push({
    axis: "지원이력",
    tone: total === 0 ? "muted" : "good",
    headline: total === 0 ? "지원 이력 없음" : `${total}건 수혜 · ${company.support.지원연도수 ?? 0}개년`,
    detail: applied > 0 ? `신청 ${applied}건 중 선정 ${selected}건 (${Math.round((selected / applied) * 100)}%)` : null,
  });

  // 중복수혜
  const recent = recentSelectionCount(company, latestYear);
  out.push({
    axis: "중복수혜",
    tone: company.duplicateFlag?.status === "flag" ? "bad" : recent >= DUPLICATE_RISK_THRESHOLD ? "warn" : "good",
    headline: `최근 ${DUPLICATE_RISK_WINDOW_YEARS}년 ${recent}회 선정`,
    detail: company.duplicateFlag?.label ?? null,
  });

  // 사업정체성
  const fit = company.businessFit;
  out.push({
    axis: "사업정체성",
    tone: !fit ? "muted" : (fit.breakdown["무관"] ?? 0) > 0 ? "warn" : "good",
    headline: fit ? fit.matchType : "판정 없음",
    detail: fit?.summary ?? null,
  });

  return out;
}

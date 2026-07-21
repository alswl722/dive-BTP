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
  kind?: "employment" | "lifeline"; // 특수 렌더(펼침표 등)를 붙일 신호 표식
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
// 본업 적자를 영업외 이익으로 흑자 전환한 해가 이 연수 이상이면 "만성 연명"(위험).
// 최근연도 부호만 보면 2379(5년 중 4년 연명, 최근연도는 둘 다 적자)를 놓친다 → 다년 누적으로 판정.
// 1년은 일회성일 수 있어 제외(표본 117·695·1049가 각 1년) → 2년을 만성 판정선으로.
export const LIFELINE_CHRONIC_YEARS = 2;
// 고용 회전율 판정선(가입자 대비 비율). 표본에서 695(이직률 0.93·회전율 2.29)만 불안정,
// 나머지(117:0, 1730:0.19, 1878:0.10, 2379:0.45)는 아래 → 이 선이 695를 분리한다.
export const TURNOVER_HIGH = 0.5;  // 이직률(퇴직/가입) 이 이상 = 유출 과다
export const CHURN_HIGH = 0.8;     // 회전율((취업+퇴직)/가입) 이 이상 = 인력 이동 과다

const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);

/** 고용 불안정 판정 — 배지와 동일 임계(이직률≥0.5 OR 회전율≥0.8). 목록 필터가 공유. */
export function isEmploymentUnstable(c: Company): boolean {
  const t = c.passthrough.이직률_최근;
  const ch = c.passthrough.고용회전율_최근;
  return (t != null && t >= TURNOVER_HIGH) || (ch != null && ch >= CHURN_HIGH);
}

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
  // 본업 만성 적자를 영업외 이익으로 연명 — 지속가능성 낮음. 최근연도 부호가 아닌 다년 누적으로 판정.
  const lifeline = company.passthrough.영업외의존_연수;
  const finObs = company.passthrough.재무관측연수;
  if (lifeline != null && lifeline >= LIFELINE_CHRONIC_YEARS) {
    out.push({
      sev: "위험", axis: "재무", title: "영업외 이익으로 연명", kind: "lifeline",
      detail: `본업 적자를 영업외 이익으로 흑자 전환한 해가 ${finObs ? `${finObs}년 중 ` : ""}${lifeline}년. 지속가능성을 확인하세요.`,
    });
  }
  // 본업 흑자인데 최근연도 최종 적자 — 이자·손상 등 영업외가 본업을 갉아먹음(단발 급성 신호).
  const opm = company.rawMetrics["영업이익률_최근"];
  const nim = company.rawMetrics["순이익률_최근"];
  if (opm != null && nim != null && opm >= 0 && nim < 0) {
    out.push({
      sev: "주의", axis: "재무", title: "본업 흑자·최종 적자",
      detail: `영업이익률 ${pct(opm)}인데 순이익률 ${pct(nim)}. 영업외 손실이 최종 적자를 만들었습니다.`,
    });
  }
  // 고용 회전율 높음 — 채용이 많아 성장처럼 보여도 이직이 잦으면 인력이 정착 못 함.
  // ⚠️ '주의'로 둔다(결격 아님). 성장기업의 정상 채용일 수 있어 확인이 필요한 사안.
  // 문구는 순증(취업−퇴직) 부호로 분기 — '순증' 용어 대신 "채용이 퇴사보다 N명 많다"로 풀어씀.
  const turnover = company.passthrough.이직률_최근;
  const churn = company.passthrough.고용회전율_최근;
  const netHire = company.passthrough.고용순증_최근;
  if ((turnover != null && turnover >= TURNOVER_HIGH) || (churn != null && churn >= CHURN_HIGH)) {
    // 세 지표(순증·이직률·회전율)는 모두 최근 관측연도 1년치 → 문구에 "최근 1년" 명시.
    const rate = `이직률 ${pct(turnover)}·회전율 ${pct(churn)}`;
    let detail: string;
    if (netHire != null && netHire > 0) {
      detail = `최근 1년 채용이 퇴사보다 ${netHire}명 많지만 ${rate}. 실제 성장인지 확인하세요.`;
    } else if (netHire != null && netHire < 0) {
      detail = `최근 1년 퇴사가 채용보다 ${Math.abs(netHire)}명 많고 ${rate}. 인력 이탈이 잦습니다.`;
    } else {
      detail = `최근 1년 채용과 퇴사가 맞먹고 ${rate}. 인력 이동이 큽니다.`;
    }
    out.push({ sev: "주의", axis: "재무", title: "고용 회전율 높음", kind: "employment", detail });
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
  //
  // ⚠️ 심각도를 '주의'로 둔다(한때 '위험'이었음). 기간이 겹치고 성격이 같아도
  //    범위·용도가 다르면 정당한 지원일 수 있어 그 자체로 결격이 아니다 — 확인이
  //    필요한 사안이다. '위험'은 자본잠식·안정성 하위·인증 실체괴리처럼 결격에
  //    준하는 것만 남긴다. 표본에서 11곳 중 4곳이 이 규칙만으로 '위험'이 되어
  //    목록이 온통 빨강이 됐고, 그러면 진짜 결격 신호가 묻힌다.
  const conc = summarizeConcurrent(company);
  if (conc.crossDeptSameType > 0) {
    out.push({
      sev: "주의", axis: "지원이력", title: "같은 성격 지원 동시 수령",
      detail: `수행 기간이 겹치는 ${conc.crossDeptSameType}쌍이 서로 다른 사업군에서 같은 성격의 지원입니다. 중복 수혜 여부를 확인하세요.`,
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
  //
  // ⚠️ 선정률을 그대로 쓰면 오독한다. 보유 데이터는 선정 건 위주라(표본 89건 중
  //    탈락 8·포기 1) 11곳 중 8곳이 100%로 나오는데, 이건 "항상 선정되는 기업"이
  //    아니라 "탈락 이력이 데이터에 없다"는 뜻이다. 탈락/포기 기록이 있을 때만
  //    비율을 보여주고, 없으면 선정 건수만 말한다.
  const total = company.support.건수 ?? 0;
  const selected = company.supportHistory.filter((h) => h.result === "선정").length;
  const applied = company.supportHistory.length;
  const rejected = applied - selected;
  out.push({
    axis: "지원이력",
    tone: total === 0 ? "muted" : "good",
    headline: total === 0 ? "지원 이력 없음" : `${total}건 수혜 · ${company.support.지원연도수 ?? 0}개년`,
    detail:
      applied === 0
        ? null
        : rejected > 0
          ? `신청 ${applied}건 중 선정 ${selected}건 (${Math.round((selected / applied) * 100)}%)`
          : `선정 ${selected}건 · 탈락 기록 없음(데이터 한계)`,
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

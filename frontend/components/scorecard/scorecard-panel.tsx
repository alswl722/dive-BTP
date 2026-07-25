"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import { ScorecardHeader } from "@/components/scorecard/scorecard-header";
import { CompositeBreakdown } from "@/components/scorecard/composite-breakdown";
import { FinanceTab } from "@/components/scorecard/tabs/finance-tab";
import { RndTab } from "@/components/scorecard/tabs/rnd-tab";
import { EmploymentTab } from "@/components/scorecard/tabs/employment-tab";
import { DuplicateRiskTab } from "@/components/scorecard/tabs/duplicate-risk-tab";
import { BusinessFitTab } from "@/components/scorecard/tabs/business-fit-tab";
import { NoteComposer } from "@/components/scorecard/note-composer";
import type { Axis, Company, CompositeGroup } from "@/types";

// 개요 탭은 해체됨 — 종합점수·7축 그래프는 상단(심사요약 자리)으로 승격, 나머지 박스는
// 재무/R&D/사업정체성 탭으로 이동(재무추세·핵심재무지표→재무, 인증→R&D, 정합성→사업정체성).
// 지원이력 탭은 중복수혜로 통합됐다. 고용 탭은 재무 4축과 별도 축(스코어링 미포함).
// export인 이유 — 리포트 편집 빌더가 "전체 담기"에서 이 목록대로 탭을 순회한다.
export const TAB_LIST = ["재무", "R&D", "고용", "중복수혜", "사업정체성"] as const;
export type Tab = (typeof TAB_LIST)[number];

import { DEFAULT_TECH_WEIGHTS, type TechAxis } from "@/lib/scoring";

export function ScorecardPanel({
  company,
  latestYear,
  programKey,
  weights,
  groupWeights,
  techWeights = DEFAULT_TECH_WEIGHTS,
  onClose,
  onExpand,
  tab: tabProp,
  onTabChange,
}: {
  company: Company;
  latestYear: number;
  programKey?: string | null;
  weights?: Record<Axis, number>;
  groupWeights?: Record<CompositeGroup, number>;
  techWeights?: Record<TechAxis, number>;
  onClose?: () => void;
  onExpand?: () => void;
  // 리포트 편집기에서 탭을 제어하며 각 탭을 순회 캡처하기 위한 선택적 controlled 모드
  tab?: Tab;
  onTabChange?: (t: Tab) => void;
}) {
  const [tabState, setTabState] = useState<Tab>("재무");
  const tab = tabProp ?? tabState;
  const setTab = (t: Tab) => (onTabChange ? onTabChange(t) : setTabState(t));

  return (
    <div className="space-y-5">
      <ScorecardHeader company={company} latestYear={latestYear} programKey={programKey} weights={weights} groupWeights={groupWeights} techWeights={techWeights} onClose={onClose} onExpand={onExpand} />
      {/* 종합점수 + 7축 breakdown — 개요 탭에서 승격, 탭과 무관하게 항상 노출 */}
      <CompositeBreakdown company={company} />
      <div className="scroll-mt-4 space-y-4">
        <Tabs tabs={[...TAB_LIST]} active={tab} onChange={(t) => setTab(t as Tab)} />
        <div>
          {tab === "재무" && <FinanceTab company={company} latestYear={latestYear} />}
          {tab === "R&D" && <RndTab company={company} latestYear={latestYear} />}
          {tab === "고용" && <EmploymentTab company={company} latestYear={latestYear} />}
          {tab === "중복수혜" && <DuplicateRiskTab company={company} latestYear={latestYear} />}
          {tab === "사업정체성" && <BusinessFitTab company={company} latestYear={latestYear} />}
        </div>
      </div>
      {/* 심사 상태만 지정하고 근거를 남길 곳이 없던 문제 — 여기서 바로 기록 */}
      <NoteComposer company={company} />
    </div>
  );
}

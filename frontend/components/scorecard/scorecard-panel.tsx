"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import { ScorecardHeader } from "@/components/scorecard/scorecard-header";
import { OverviewTab } from "@/components/scorecard/tabs/overview-tab";
import { FinanceTab } from "@/components/scorecard/tabs/finance-tab";
import { RndTab } from "@/components/scorecard/tabs/rnd-tab";
import { SupportHistoryTab } from "@/components/scorecard/tabs/support-history-tab";
import { DuplicateRiskTab } from "@/components/scorecard/tabs/duplicate-risk-tab";
import { BusinessFitTab } from "@/components/scorecard/tabs/business-fit-tab";
import { ReviewSummary } from "@/components/scorecard/review-summary";
import { NoteComposer } from "@/components/scorecard/note-composer";
import type { Axis, Company, CompositeGroup } from "@/types";

const TAB_LIST = ["개요", "재무", "R&D", "지원이력", "중복수혜", "사업정체성"] as const;
type Tab = (typeof TAB_LIST)[number];

export function ScorecardPanel({
  company,
  latestYear,
  programKey,
  weights,
  groupWeights,
  onClose,
  onExpand,
}: {
  company: Company;
  latestYear: number;
  programKey?: string | null;
  weights?: Record<Axis, number>;
  groupWeights?: Record<CompositeGroup, number>;
  onClose?: () => void;
  onExpand?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("개요");
  return (
    <div className="space-y-5">
      <ScorecardHeader company={company} latestYear={latestYear} programKey={programKey} weights={weights} groupWeights={groupWeights} onClose={onClose} onExpand={onExpand} />
      {/* 심사 요약 — 탭에 흩어진 축별 결론·위험 신호를 한곳에. 클릭 시 해당 탭으로 이동 */}
      <ReviewSummary company={company} latestYear={latestYear} onJumpTab={(t) => setTab(t as Tab)} />
      <Tabs tabs={[...TAB_LIST]} active={tab} onChange={(t) => setTab(t as Tab)} />
      <div>
        {tab === "개요" && <OverviewTab company={company} />}
        {tab === "재무" && <FinanceTab company={company} />}
        {tab === "R&D" && <RndTab company={company} />}
        {tab === "지원이력" && <SupportHistoryTab company={company} />}
        {tab === "중복수혜" && <DuplicateRiskTab company={company} latestYear={latestYear} />}
        {tab === "사업정체성" && <BusinessFitTab company={company} />}
      </div>
      {/* 심사 상태만 지정하고 근거를 남길 곳이 없던 문제 — 여기서 바로 기록 */}
      <NoteComposer company={company} />
    </div>
  );
}

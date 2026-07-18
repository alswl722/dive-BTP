"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import { ScorecardHeader } from "@/components/scorecard/scorecard-header";
import { OverviewTab } from "@/components/scorecard/tabs/overview-tab";
import { FinanceTab } from "@/components/scorecard/tabs/finance-tab";
import { RndTab } from "@/components/scorecard/tabs/rnd-tab";
import { SupportHistoryTab } from "@/components/scorecard/tabs/support-history-tab";
import { DuplicateRiskTab } from "@/components/scorecard/tabs/duplicate-risk-tab";
import type { Axis, Company } from "@/types";

const TAB_LIST = ["개요", "재무", "R&D", "지원이력", "중복수혜"] as const;
type Tab = (typeof TAB_LIST)[number];

export function ScorecardPanel({
  company,
  latestYear,
  weights,
  onClose,
  onExpand,
}: {
  company: Company;
  latestYear: number;
  weights?: Record<Axis, number>;
  onClose?: () => void;
  onExpand?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("개요");
  return (
    <div className="space-y-5">
      <ScorecardHeader company={company} latestYear={latestYear} weights={weights} onClose={onClose} onExpand={onExpand} />
      <Tabs tabs={[...TAB_LIST]} active={tab} onChange={(t) => setTab(t as Tab)} />
      <div>
        {tab === "개요" && <OverviewTab company={company} />}
        {tab === "재무" && <FinanceTab company={company} />}
        {tab === "R&D" && <RndTab company={company} />}
        {tab === "지원이력" && <SupportHistoryTab company={company} />}
        {tab === "중복수혜" && <DuplicateRiskTab company={company} latestYear={latestYear} />}
      </div>
    </div>
  );
}

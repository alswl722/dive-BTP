import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCompany, listCompanies } from "@/lib/api";
import { ScorecardHeader } from "@/components/scorecard/scorecard-header";
import { AxisScorePanel } from "@/components/scorecard/axis-score-panel";
import { AxisDrilldown } from "@/components/scorecard/axis-drilldown";
import { SignalBadges } from "@/components/scorecard/signal-badges";
import { SupportTimeline } from "@/components/scorecard/support-timeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export async function generateStaticParams() {
  const companies = await listCompanies();
  return companies.map((c) => ({ id: String(c.id) }));
}

export default async function ScorecardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await getCompany(Number(id));
  if (!company) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href="/companies" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> 기업 목록
      </Link>

      <ScorecardHeader company={company} />

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <AxisScorePanel scores={company.scores} />
        <SignalBadges company={company} />
      </div>

      <AxisDrilldown company={company} />

      <SupportTimeline company={company} />

      <Card>
        <CardHeader>
          <CardTitle>사업목적 – 지원사업 정합성</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          축8(LLM 정합성 판정) 연동 예정 — 등기부등본 사업목적 텍스트와 지원사업의 적합도를 여기 표시합니다.
        </CardContent>
      </Card>
    </div>
  );
}

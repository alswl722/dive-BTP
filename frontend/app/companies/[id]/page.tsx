import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCompany, listCompanies, listNotes } from "@/lib/api";
import { ScorecardPanel } from "@/components/scorecard/scorecard-panel";
import { RecentlyViewedTracker } from "@/components/scorecard/recently-viewed-tracker";
import { latestSupportYear } from "@/lib/duplicate-risk";
import { MentionedNotes } from "@/components/notes/notes-explorer";
import { CompanyExportButton } from "@/components/scorecard/company-export-button";

export async function generateStaticParams() {
  const companies = await listCompanies();
  return companies.map((c) => ({ id: String(c.id) }));
}

export default async function ScorecardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [company, companies, notes] = await Promise.all([
    getCompany(Number(id)),
    listCompanies(),
    listNotes({ companyId: Number(id) }),  // 이 기업이 언급된 메모(역방향)
  ]);
  if (!company) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <RecentlyViewedTracker companyId={company.id} />
      <div className="mb-4 flex items-center justify-between">
        <Link href="/companies" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> 기업 목록
        </Link>
        <CompanyExportButton company={company} latestYear={latestSupportYear(companies)} />
      </div>
      <ScorecardPanel company={company} latestYear={latestSupportYear(companies)} />

      <div className="mt-6">
        <p className="mb-2 text-[12.5px] font-bold">
          이 기업이 언급된 메모 <span className="font-normal text-muted-foreground">{notes.length}건</span>
        </p>
        <MentionedNotes notes={notes} emptyText="아직 이 기업을 언급한 메모가 없습니다. 메모에서 @로 언급하면 여기 모입니다." />
      </div>
    </div>
  );
}

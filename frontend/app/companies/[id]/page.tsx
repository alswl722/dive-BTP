import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCompany, listCompanies } from "@/lib/api";
import { ScorecardPanel } from "@/components/scorecard/scorecard-panel";
import { RecentlyViewedTracker } from "@/components/scorecard/recently-viewed-tracker";
import { latestSupportYear } from "@/lib/duplicate-risk";

export async function generateStaticParams() {
  const companies = await listCompanies();
  return companies.map((c) => ({ id: String(c.id) }));
}

export default async function ScorecardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [company, companies] = await Promise.all([getCompany(Number(id)), listCompanies()]);
  if (!company) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <RecentlyViewedTracker companyId={company.id} />
      <Link href="/companies" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> 기업 목록
      </Link>
      <ScorecardPanel company={company} latestYear={latestSupportYear(companies)} />
      <p className="mt-6 px-1 text-xs text-muted-foreground">사업목적 – 지원사업 정합성 판정(축8)은 준비 중입니다.</p>
    </div>
  );
}

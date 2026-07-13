import { listCompanies } from "@/lib/api";
import { CompanyList } from "@/components/company-list";

export default async function CompaniesPage() {
  const companies = await listCompanies();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">기업 검색</h1>
        <p className="text-sm text-muted-foreground">재무 4축 점수 미리보기 · 기업을 눌러 종합 스코어카드로</p>
      </div>
      <CompanyList companies={companies} />
    </div>
  );
}

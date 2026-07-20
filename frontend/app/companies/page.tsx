import { Suspense } from "react";
import { listCompanies, listPrograms } from "@/lib/api";
import { CompaniesEntry } from "@/components/companies/companies-entry";

export default async function CompaniesPage() {
  const [companies, programs] = await Promise.all([listCompanies(), listPrograms()]);
  return (
    <Suspense>
      {/* 사업 미선택이면 배정 사업 목록, 선택하면 해당 사업의 기업 심사 화면 */}
      <CompaniesEntry companies={companies} programs={programs} />
    </Suspense>
  );
}

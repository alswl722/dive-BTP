import { Suspense } from "react";
import { listCompanies, listPrograms } from "@/lib/api";
import { CompaniesEntry } from "@/components/companies/companies-entry";

export default async function CompaniesPage() {
  const [companies, programs] = await Promise.all([listCompanies(), listPrograms()]);
  return (
    <Suspense>
      {/* 사업 미선택이면 첫 사업으로 자동 이동, 선택하면 해당 사업의 기업 조회 화면(조회는 전 직원 공통) */}
      <CompaniesEntry companies={companies} programs={programs} />
    </Suspense>
  );
}

import { Suspense } from "react";
import { listCompanies, listPrograms } from "@/lib/api";
import { CompaniesExplorer } from "@/components/companies/companies-explorer";

export default async function CompaniesPage() {
  const [companies, programs] = await Promise.all([listCompanies(), listPrograms()]);
  return (
    <Suspense>
      <CompaniesExplorer companies={companies} programs={programs} />
    </Suspense>
  );
}

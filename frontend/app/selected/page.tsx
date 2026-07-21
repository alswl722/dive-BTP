import { listCompanies, listPrograms } from "@/lib/api";
import { SelectedList } from "@/components/companies/selected-list";

export default async function SelectedPage() {
  const [companies, programs] = await Promise.all([listCompanies(), listPrograms()]);
  return <SelectedList companies={companies} programs={programs} />;
}

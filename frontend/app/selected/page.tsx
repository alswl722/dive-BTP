import { listCompanies } from "@/lib/api";
import { SelectedList } from "@/components/companies/selected-list";

export default async function SelectedPage() {
  const companies = await listCompanies();
  return <SelectedList companies={companies} />;
}

import { listCompanies, listPrograms } from "@/lib/api";
import { Permissions } from "@/components/admin/permissions";

export default async function AdminPermissionsPage() {
  const [companies, programs] = await Promise.all([listCompanies(), listPrograms()]);
  return <Permissions companies={companies} programs={programs} />;
}

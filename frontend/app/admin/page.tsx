import { listCompanies, listPrograms } from "@/lib/api";
import { AdminConsole } from "@/components/admin/admin-console";

// 접근 제어는 AuthGate에서 처리(관리자 role만 /admin 진입 가능).
export default async function AdminPage() {
  const [companies, programs] = await Promise.all([listCompanies(), listPrograms()]);
  return <AdminConsole companies={companies} programs={programs} />;
}

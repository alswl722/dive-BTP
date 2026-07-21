import { listCompanies, listPrograms } from "@/lib/api";
import { ProgramSettings } from "@/components/admin/program-settings";

// 접근 제어는 AuthGate에서 처리(관리자 role만 /admin 진입 가능).
export default async function AdminPage() {
  const [companies, programs] = await Promise.all([listCompanies(), listPrograms()]);
  return <ProgramSettings companies={companies} programs={programs} />;
}

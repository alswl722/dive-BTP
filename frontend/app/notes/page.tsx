import { listCompanies, listPrograms } from "@/lib/api";
import { NotesExplorer } from "@/components/notes/notes-explorer";

export default async function NotesPage() {
  // 멘션 자동완성 후보로 기업·사업 목록이 필요하다. 메모 자체는 공유 store(NotesStoreProvider)에서 온다.
  const [companies, programs] = await Promise.all([listCompanies(), listPrograms()]);
  return <NotesExplorer companies={companies} programs={programs} />;
}

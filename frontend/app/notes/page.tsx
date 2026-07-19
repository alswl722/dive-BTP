import { listCompanies, listNotes, listPrograms } from "@/lib/api";
import { NotesExplorer } from "@/components/notes/notes-explorer";

export default async function NotesPage() {
  // 멘션 자동완성 후보로 기업·사업 목록이 필요하다.
  const [notes, companies, programs] = await Promise.all([listNotes(), listCompanies(), listPrograms()]);
  return <NotesExplorer initialNotes={notes} companies={companies} programs={programs} />;
}

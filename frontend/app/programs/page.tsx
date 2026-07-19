import { listCompanies, listNotes, listPrograms } from "@/lib/api";
import { ProgramsExplorer } from "@/components/programs/programs-explorer";
import { dashboardReferenceDate } from "@/lib/program-progress";

export default async function ProgramsPage() {
  // 사업↔기업 연결(선정 기업 목록·함께 받은 사업)은 supportHistory로 클라이언트 조인한다.
  const [programs, companies, notes] = await Promise.all([listPrograms(), listCompanies(), listNotes()]);
  const referenceDateIso = dashboardReferenceDate(programs).toISOString().slice(0, 10);

  return (
    // 헤더(제목·요약·CSV)는 필터 상태에 따라 바뀌므로 ProgramsExplorer가 직접 그린다.
    <ProgramsExplorer programs={programs} companies={companies} notes={notes} referenceDateIso={referenceDateIso} />
  );
}

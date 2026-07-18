import { listPrograms } from "@/lib/api";
import { ProgramsExplorer } from "@/components/programs/programs-explorer";
import { dashboardReferenceDate } from "@/lib/program-progress";

export default async function ProgramsPage() {
  const programs = await listPrograms();
  const referenceDateIso = dashboardReferenceDate(programs).toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">지원 사업</h1>
        <p className="text-sm text-muted-foreground">
          2022~2024년 부산TP 사업 목록 {programs.length}건 · 과거/현재 보유 데이터만 표시(신규 등록 없음)
        </p>
      </div>
      <ProgramsExplorer programs={programs} referenceDateIso={referenceDateIso} />
    </div>
  );
}

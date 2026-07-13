import { listCompanies } from "@/lib/api";
import { CompareView } from "@/components/compare-view";

export default async function ComparePage() {
  const companies = await listCompanies();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">기업 비교</h1>
        <p className="text-sm text-muted-foreground">2~4개 기업 나란히 · 축 점수 · 선정률 · 지원 이력</p>
      </div>
      <CompareView companies={companies} />
    </div>
  );
}

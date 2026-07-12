import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getDashboard, getRankings } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DonutDist } from "@/components/charts/donut-dist";
import { BarDist } from "@/components/charts/bar-dist";
import { formatKRW } from "@/lib/utils";

export default async function DashboardPage() {
  const [dash, rank] = await Promise.all([getDashboard(), getRankings()]);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">총괄 대시보드</h1>

      {dash.dataQualityIssues > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-warn/40 bg-warn/10 px-4 py-2.5 text-sm">
          <AlertTriangle className="h-4 w-4 text-warn" />
          데이터 정합성 검증 필요 항목 <b>{dash.dataQualityIssues}건</b> (재무지표 결측 등)
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="전체 기업" value={`${dash.totalCompanies}개`} />
        <Stat label="반복선정 최다" value={`${rank.byCount[0]?.건수 ?? 0}회`} sub={rank.byCount[0]?.name} />
        <Stat label="지원금 최다" value={formatKRW(rank.byAmount[0]?.총지원금_천원)} sub={rank.byAmount[0]?.name} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <RankCard title="반복선정 랭킹 · 건수" rows={rank.byCount.slice(0, 6)} metric="건수" fmt={(v) => `${v ?? 0}회`} />
        <RankCard title="반복선정 랭킹 · 금액" rows={rank.byAmount.slice(0, 6)} metric="총지원금_천원" fmt={(v) => formatKRW(v)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>선정 사업유형 분포</CardTitle></CardHeader>
          <CardContent><DonutDist data={dash.bizTypeDist.map((d) => ({ name: d.type, value: d.count }))} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>지역 분포</CardTitle></CardHeader>
          <CardContent><BarDist data={dash.regionDist} xKey="region" yKey="count" /></CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function RankCard({ title, rows, metric, fmt }: { title: string; rows: any[]; metric: string; fmt: (v: number) => string }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="pt-0">
        <Table>
          <THead><TR><TH>#</TH><TH>기업</TH><TH>업종</TH><TH className="text-right">{metric === "건수" ? "선정" : "누적금액"}</TH></TR></THead>
          <TBody>
            {rows.map((r, i) => (
              <TR key={r.id}>
                <TD className="text-muted-foreground">{i + 1}</TD>
                <TD><Link href={`/companies/${r.id}`} className="text-primary hover:underline">{r.name}</Link></TD>
                <TD className="text-muted-foreground">{r.industry ?? "-"}</TD>
                <TD className="text-right tabular-nums font-medium">{fmt(r[metric])}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}

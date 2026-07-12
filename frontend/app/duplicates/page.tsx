import Link from "next/link";
import { getRankings } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatKRW } from "@/lib/utils";

const THRESHOLD = 2; // 반복선정 기준(GROUP BY ... HAVING COUNT >= N)

export default async function DuplicatesPage() {
  const rank = await getRankings();
  const repeat = rank.byCount.filter((r) => (r.건수 ?? 0) >= THRESHOLD);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">중복지원 탐지</h1>
        <p className="text-sm text-muted-foreground">
          규칙기반 반복선정 (선정 {THRESHOLD}회 이상) · 건수와 금액을 분리해 "자잘하게 많이 vs 크게 몇 번"을 구분
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-2.5 text-sm">
        반복선정 기업 <Badge variant="warn">{repeat.length}곳</Badge>
        <span className="text-muted-foreground">· 상위 기업을 비교 화면으로 넘겨 나란히 검토</span>
        <Link href="/compare" className="ml-auto text-primary hover:underline">비교 화면 →</Link>
      </div>

      <Card>
        <CardHeader><CardTitle>반복선정 랭킹</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <Table>
            <THead>
              <TR><TH>#</TH><TH>기업</TH><TH>업종</TH><TH className="text-right">선정 건수</TH><TH className="text-right">누적 지원금</TH></TR>
            </THead>
            <TBody>
              {repeat.map((r, i) => (
                <TR key={r.id}>
                  <TD className="text-muted-foreground">{i + 1}</TD>
                  <TD><Link href={`/companies/${r.id}`} className="font-medium text-primary hover:underline">{r.name}</Link></TD>
                  <TD className="text-muted-foreground">{r.industry ?? "-"}</TD>
                  <TD className="text-right tabular-nums">
                    <Badge variant={(r.건수 ?? 0) >= 5 ? "bad" : "secondary"}>{r.건수 ?? 0}회</Badge>
                  </TD>
                  <TD className="text-right tabular-nums font-medium">{formatKRW(r.총지원금_천원)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

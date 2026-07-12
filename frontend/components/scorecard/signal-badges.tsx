import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Company } from "@/types";

export function SignalBadges({ company }: { company: Company }) {
  const certs = Object.entries(company.certifications).filter(([, v]) => v).map(([k]) => k);
  return (
    <Card>
      <CardHeader>
        <CardTitle>인증 · 기술 신호</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <p className="mb-1.5 text-xs text-muted-foreground">보유 인증</p>
          <div className="flex flex-wrap gap-1.5">
            {certs.length ? certs.map((c) => <Badge key={c} variant="good">{c}</Badge>) : <span className="text-muted-foreground">없음</span>}
          </div>
        </div>
        <div className="flex gap-6">
          <div>
            <p className="text-xs text-muted-foreground">특허 (등록/출원)</p>
            <p className="font-medium tabular-nums">{company.patents.등록 ?? "-"} / {company.patents.출원 ?? "-"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">NTIS (주관/위탁)</p>
            <p className="font-medium tabular-nums">{company.ntis.주관 ?? 0} / {company.ntis.위탁 ?? 0}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

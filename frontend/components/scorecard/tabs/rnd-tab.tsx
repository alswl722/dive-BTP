import { AlertTriangle, Check, X } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import type { Company } from "@/types";
import { cn } from "@/lib/utils";

export function RndTab({ company }: { company: Company }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="특허 등록" value={`${company.patents.등록 ?? 0}건`} />
        <StatCard label="특허 출원" value={`${company.patents.출원 ?? 0}건`} />
        <StatCard label="NTIS 주관" value={`${company.ntis.주관 ?? 0}건`} />
        <StatCard label="NTIS 위탁" value={`${company.ntis.위탁 ?? 0}건`} />
      </div>

      <div>
        <p className="mb-2.5 text-[12.5px] font-bold">인증 취득현황</p>
        <div className="divide-y rounded-lg border">
          {Object.entries(company.certifications).map(([k, has]) => (
            <div key={k} className="flex items-center justify-between px-3.5 py-2.5 text-[12.5px]">
              <span>{k}</span>
              <span className={cn("flex items-center gap-1 font-medium", has ? "text-good" : "text-muted-foreground")}>
                {has ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                {has ? "보유" : "미보유"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {!company.dataQuality.ok && (
        <div className="flex items-start gap-2 rounded-lg bg-warn-bg px-3.5 py-3 text-[12px] text-[hsl(30_75%_38%)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <p className="font-medium">누락 데이터 {company.dataQuality.missing.length}건</p>
            <p className="mt-0.5 text-[11.5px] opacity-90">{company.dataQuality.missing.join(", ")}</p>
          </div>
        </div>
      )}
    </div>
  );
}

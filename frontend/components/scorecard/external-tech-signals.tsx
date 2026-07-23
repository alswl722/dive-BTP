import { Globe, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Company } from "@/types";
import { resolveTechExternalSignals } from "@/lib/external-data";
import { cn } from "@/lib/utils";

const VENTURE_TONE: Record<string, "good" | "info" | "warn" | "secondary"> = {
  연구개발형: "good",
  혁신성장형: "info",
  벤처투자형: "warn",
  미확인: "secondary",
};

const TONE_TEXT: Record<"good" | "warn" | "muted", string> = {
  good: "text-good",
  warn: "text-[hsl(30_75%_38%)]",
  muted: "text-muted-foreground",
};

/**
 * 외부 공공데이터로 보강한 R&D 신호 3종 — 벤처확인 유형 / 특허 기술분류 집중도 / 정부지원 대비 성과.
 * 데모 데이터는 비식별이라 mock 어댑터로 파생(설계: lib/external-data.ts). 실 연동 시 사업자번호 기반 API로 교체.
 */
export function ExternalTechSignals({ company }: { company: Company }) {
  const sig = resolveTechExternalSignals(company);
  const { venture, patentClass, govRnd } = sig;

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">외부 공공데이터</p>
        {sig.source === "mock" && (
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">목업</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* 벤처확인 유형 — boolean을 넘어 기술형/투자형 구분 */}
        <div className="rounded-lg border p-3">
          <p className="text-[11px] text-muted-foreground">벤처확인 유형</p>
          <div className="mt-1 flex items-center gap-1.5">
            <Badge variant={VENTURE_TONE[venture.type] ?? "secondary"} className="text-[11px]">{venture.type}</Badge>
          </div>
          <p className="mt-1.5 text-[10.5px] text-muted-foreground">{venture.reason}</p>
        </div>

        {/* 특허 기술분류 집중도 — 전문형 vs 분산형 */}
        <div className="rounded-lg border p-3">
          <p className="text-[11px] text-muted-foreground">특허 기술분류 집중도</p>
          {patentClass ? (
            <>
              <p className={cn("mt-1 text-[18px] font-extrabold tabular-nums leading-none", TONE_TEXT[patentClass.tone])}>
                {patentClass.concentration}%
                <span className="ml-1 text-[11px] font-normal text-muted-foreground">{patentClass.tone === "good" ? "전문형" : "분산형"}</span>
              </p>
              <p className="mt-1.5 text-[10.5px] text-muted-foreground">
                {patentClass.ipcSection} · {patentClass.fieldCount}개 분야
              </p>
            </>
          ) : (
            <p className="mt-1 text-[12px] text-muted-foreground">등록 특허 없음</p>
          )}
        </div>

        {/* 정부지원 대비 성과 — 억원당 등록특허(실측 근사) */}
        <div className="rounded-lg border p-3">
          <p className="text-[11px] text-muted-foreground">정부지원 대비 성과</p>
          {govRnd && govRnd.patentsPerEok != null ? (
            <>
              <p className={cn("mt-1 text-[18px] font-extrabold tabular-nums leading-none", TONE_TEXT[govRnd.tone])}>
                {govRnd.patentsPerEok}
                <span className="ml-1 text-[11px] font-normal text-muted-foreground">건/억원</span>
              </p>
              <p className="mt-1.5 text-[10.5px] text-muted-foreground">
                정부연구비 {govRnd.govFundEok}억 · 등록 {govRnd.registeredPatents}건
              </p>
            </>
          ) : (
            <p className="mt-1 text-[12px] text-muted-foreground">{govRnd?.note ?? "정부 R&D 없음"}</p>
          )}
        </div>
      </div>

      <p className="flex items-start gap-1.5 text-[10.5px] text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        <span>
          벤처확인 유형·특허 IPC는 실 운영 시 <b className="text-foreground">사업자번호 기반 공공 API</b>(중기부 벤처확인 명단·특허청 KIPRIS)로 연동됩니다.
          현재는 보유 데이터로 파생한 목업이며, 정부지원 대비 성과는 성과 시차가 있어 최근 수주 기업은 낮게 보일 수 있습니다.
        </span>
      </p>
    </section>
  );
}

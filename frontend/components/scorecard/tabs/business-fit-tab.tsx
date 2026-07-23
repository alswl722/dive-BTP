"use client";

import { Check, Clock, Sparkles, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AxisSignals } from "@/components/scorecard/axis-signals";
import type { Company, MatchType, AlignmentJudgment } from "@/types";

const MATCH_STYLE: Record<MatchType, { badge: "good" | "info" | "warn" | "bad" | "slate"; dot: string; text: string }> = {
  직접일치: { badge: "good", dot: "bg-good", text: "text-good" },
  간접관련: { badge: "info", dot: "bg-info", text: "text-info" },
  무관: { badge: "warn", dot: "bg-warn", text: "text-warn" },
  판단유보: { badge: "slate", dot: "bg-slate-400", text: "text-slate-500" },
};

export function BusinessFitTab({ company, latestYear }: { company: Company; latestYear: number }) {
  const fit = company.businessFit;
  const hasSupportHistory = (company.supportHistory ?? []).length > 0;

  if (!fit) {
    return (
      <div className="rounded-lg bg-subtle p-6 text-center text-[13px] text-muted-foreground">
        {hasSupportHistory
          ? "판정 데이터 없음 (백엔드 미연결 또는 fixture 미갱신)"
          : "받은 지원이력 없음 — 정합성 판정 대상 없음"}
      </div>
    );
  }

  const style = MATCH_STYLE[fit.matchType];

  // 매치타입별로 그룹핑
  const grouped: Record<MatchType, AlignmentJudgment[]> = {
    직접일치: [],
    간접관련: [],
    무관: [],
    판단유보: [],
  };
  for (const j of fit.judgments) {
    grouped[j.matchType].push(j);
  }

  const total = fit.totalJudged + fit.totalPending;

  return (
    <div className="space-y-5">
      <AxisSignals company={company} latestYear={latestYear} axis="사업정체성" />

      {/* 상단 요약 배너 */}
      <Card className="p-5 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h3 className="text-[16px] font-extrabold">사업정체성 정합성</h3>
              <Badge variant="slate" className="text-[10px]">AI 판정</Badge>
            </div>
            <p className="text-[13.5px] leading-relaxed text-foreground">
              {fit.summary}
            </p>
          </div>
          <div className="text-right shrink-0">
            <Badge variant={style.badge} className="text-[13px] px-2.5 py-1 mb-1">
              {fit.matchType}
            </Badge>
            {fit.score !== null && (
              <p className="text-[24px] font-extrabold tabular-nums leading-none">
                {fit.score.toFixed(0)}
                <span className="text-[13px] font-normal text-muted-foreground ml-0.5">/100</span>
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* 매치타입별 카운트 */}
      <div className="grid grid-cols-4 gap-3">
        {(["직접일치", "간접관련", "무관", "판단유보"] as MatchType[]).map((mt) => {
          const count = fit.breakdown[mt] ?? 0;
          const pct = total > 0 ? (count / total * 100) : 0;
          const s = MATCH_STYLE[mt];
          return (
            <div key={mt} className="rounded-lg border p-3 text-center">
              <div className={`mx-auto mb-1 h-2.5 w-2.5 rounded-full ${s.dot}`} />
              <p className={`text-[11px] font-medium ${s.text}`}>{mt}</p>
              <p className="text-[22px] font-extrabold tabular-nums mt-0.5">{count}</p>
              <p className="text-[10px] text-muted-foreground">{pct.toFixed(0)}%</p>
            </div>
          );
        })}
      </div>

      {/* 판정 완료·대기 요약 카드는 상단 헤더의 "20건 정합성 판정: …" 문구와 4개 매치타입
          카운트 카드가 이미 같은 정보를 담아 중복. 판정 대기가 있을 때만 아래 배너로 알린다. */}
      {fit.totalPending > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-warn-bg px-3.5 py-3 text-[12.5px] text-[hsl(30_75%_38%)]">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {fit.totalPending}건은 whitelist 미통과 케이스로 LLM 시맨틱 판정 대기 중.
            <code className="mx-1 px-1 rounded bg-white text-[11px]">python scripts/run_axis8_llm_batch.py</code>
            실행 시 확정됩니다.
          </p>
        </div>
      )}

      {/* 매치타입별 상세 판정 리스트 */}
      <div className="space-y-4">
        {(["무관", "판단유보", "간접관련", "직접일치"] as MatchType[]).map((mt) => {
          const items = grouped[mt];
          if (items.length === 0) return null;
          const s = MATCH_STYLE[mt];
          const urgent = mt === "무관" || mt === "판단유보";
          return (
            <div key={mt}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`h-3 w-3 rounded-full ${s.dot}`} />
                <h4 className={`text-[13.5px] font-bold ${urgent ? s.text : ""}`}>
                  {mt} ({items.length}건)
                </h4>
                {urgent && (
                  <Badge variant={s.badge} className="text-[10px]">
                    <AlertTriangle className="mr-0.5 h-3 w-3" />
                    확인 필요
                  </Badge>
                )}
              </div>
              <div className="divide-y rounded-lg border">
                {items.map((j, i) => (
                  <JudgmentRow key={i} judgment={j} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function JudgmentRow({ judgment: j }: { judgment: AlignmentJudgment }) {
  const s = MATCH_STYLE[j.matchType];
  return (
    <div className="p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground mb-1">
            <span className="tabular-nums font-medium">{j.year}</span>
            <span>·</span>
            <span>{j.businessType || "-"}</span>
            <span>·</span>
            <span className="uppercase text-[10px] tracking-wider">
              {j.source === "whitelist" && "규칙 확정"}
              {j.source === "llm" && "🤖 AI 판정"}
              {j.source === "pending" && "판정 대기"}
            </span>
          </div>
          <p className="text-[13px] font-semibold truncate">
            {j.programName || j.programCode}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant={s.badge} className="text-[10px]">
            {j.matchType}
          </Badge>
          {j.score !== null && (
            <span className="text-[11.5px] tabular-nums text-muted-foreground font-medium">
              {j.score.toFixed(0)}점
            </span>
          )}
        </div>
      </div>
      <p className="text-[12px] text-muted-foreground leading-relaxed pl-0.5">
        {j.source === "whitelist" && <Check className="inline h-3 w-3 mr-1 text-good" />}
        {j.source === "pending" && <Clock className="inline h-3 w-3 mr-1 text-muted-foreground" />}
        {j.reasoning}
      </p>
      {j.matchedKeywords.length > 0 && (
        <div className="flex flex-wrap gap-1 pl-0.5">
          {j.matchedKeywords.map((k, ki) => (
            <span key={ki} className="text-[10px] px-1.5 py-0.5 rounded bg-subtle text-muted-foreground">
              #{k}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

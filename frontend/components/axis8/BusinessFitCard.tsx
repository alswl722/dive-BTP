"use client";

import { AlertTriangle, Check, Clock, Sparkles } from "lucide-react";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { BusinessFit, MatchType } from "@/types";

const MATCH_STYLE: Record<MatchType, { badge: "good" | "info" | "warn" | "bad" | "slate"; dot: string }> = {
  직접일치: { badge: "good", dot: "bg-good" },
  간접관련: { badge: "info", dot: "bg-info" },
  무관: { badge: "warn", dot: "bg-warn" },
  판단유보: { badge: "slate", dot: "bg-slate-400" },
};

export function BusinessFitCard({ fit, compact = false }: { fit: BusinessFit | null; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  if (!fit) {
    return (
      <Card className="p-4">
        <p className="text-[13px] text-muted-foreground">
          받은 지원이력 없음 — 정합성 판정 대상 없음
        </p>
      </Card>
    );
  }

  const style = MATCH_STYLE[fit.matchType];
  const dominantParts = Object.entries(fit.breakdown)
    .filter(([, n]) => n > 0)
    .sort(([, a], [, b]) => b - a);

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="text-[15px] font-bold">사업정체성 정합성</h3>
            <Badge variant="slate" className="text-[10px]">AI 판정</Badge>
          </div>
          <p className="text-[13px] text-foreground leading-relaxed">
            {fit.summary}
          </p>
        </div>
        <Badge variant={style.badge} className="shrink-0 text-[11px]">
          {fit.matchType}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        {dominantParts.map(([mt, count]) => (
          <div key={mt} className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <span className={`inline-block h-2 w-2 rounded-full ${MATCH_STYLE[mt as MatchType].dot}`} />
            <span>{mt} {count}건</span>
          </div>
        ))}
      </div>

      {fit.totalPending > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-warn-bg px-3 py-2 text-[11.5px] text-[hsl(30_75%_38%)]">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            {fit.totalPending}건은 LLM 시맨틱 판정 대기 중 (Claude/DeepSeek 배치 실행 시 확정)
          </p>
        </div>
      )}

      {!compact && fit.judgments.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[12px] text-primary hover:underline"
          >
            {expanded ? "▲ 지원사업별 판정 접기" : `▼ 지원사업별 판정 근거 (${fit.judgments.length}건)`}
          </button>
          {expanded && (
            <div className="mt-3 divide-y rounded-lg border">
              {fit.judgments.map((j, i) => {
                const jStyle = MATCH_STYLE[j.matchType];
                return (
                  <div key={i} className="p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                          <span className="tabular-nums">{j.year}</span>
                          <span>·</span>
                          <span>{j.businessType || "-"}</span>
                        </div>
                        <p className="text-[13px] font-medium mt-0.5 truncate">
                          {j.programName || j.programCode}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge variant={jStyle.badge} className="text-[10px]">
                          {j.matchType}
                        </Badge>
                        {j.score !== null && (
                          <span className="text-[11px] tabular-nums text-muted-foreground">
                            {j.score.toFixed(0)}점
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-[12px] text-muted-foreground leading-relaxed">
                      {j.source === "whitelist" && <Check className="inline h-3 w-3 mr-1 text-good" />}
                      {j.source === "pending" && <Clock className="inline h-3 w-3 mr-1 text-muted-foreground" />}
                      {j.reasoning}
                    </p>
                    {j.matchedKeywords.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {j.matchedKeywords.map((k, ki) => (
                          <span key={ki} className="text-[10px] px-1.5 py-0.5 rounded bg-subtle text-muted-foreground">
                            #{k}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

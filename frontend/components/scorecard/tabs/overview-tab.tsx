import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { ScoreBadge } from "@/components/ui/score-badge";
import { BusinessFitCard } from "@/components/axis8/BusinessFitCard";
import { COMPOSITE_AXES, type Company } from "@/types";
import { formatKRW, cn } from "@/lib/utils";
import { Selectable } from "@/lib/report-select";

export function OverviewTab({ company }: { company: Company }) {
  const lastSelectedYear = company.supportHistory.filter((h) => h.result === "선정").map((h) => h.date.slice(0, 4)).sort().at(-1);
  const cs = company.compositeScore;

  return (
    <div className="space-y-5">
      {/* 종합점수 breakdown — 재무4축+기술2축+정합성 7개 축이 각각 몇 점이라 이 종합점수가
          나왔는지 한곳에서 확인. 헤더의 종합점수 배지는 커스텀 가중치 반영 값이라 다를 수 있어
          여기서는 항상 서버 원본(compositeScore, 최저축 캡 적용)을 보여준다. */}
      {cs && (
        <Selectable id="ov-composite" label="종합점수" kind="chart">
        <div className="rounded-lg border p-3.5">
          <p className="mb-2.5 text-[12.5px] font-bold">
            종합점수 <span className="font-normal text-muted-foreground">(재무4축·기술2축·정합성)</span>
          </p>
          <div className="flex items-center gap-4">
            <ScoreBadge score={cs.score} size="lg" title="종합점수(최저축 캡 적용)" />
            {/* 세로 막대 + 중앙값 50 기준선 — 4축 그래프와 같은 톤. 위 20px(top-5)는
                점수 라벨 여백 — 막대 높이(%)와 50 점선이 같은 스케일을 공유해야 하므로
                라벨은 막대 위 절대배치로 뺀다. */}
            <div className="relative h-[140px] flex-1">
              <div className="absolute inset-x-0 bottom-0 top-5 border-b border-muted-foreground/30">
                <div className="pointer-events-none absolute inset-x-0 bottom-1/2 border-t border-dashed border-muted-foreground/40" />
                <div className="absolute inset-0 flex items-end gap-2 px-1">
                  {COMPOSITE_AXES.map((axis) => {
                    const v = cs.breakdown[axis];
                    const isLowest = cs.lowestAxis === axis;
                    const h = v == null ? 2 : Math.max(2, Math.min(100, v));
                    return (
                      <div key={axis} className="flex h-full flex-1 items-end justify-center">
                        <div
                          className={cn(
                            "relative w-[70%] max-w-[28px] rounded-t-[4px]",
                            v == null ? "bg-muted" : isLowest ? "bg-warn" : "bg-primary/60"
                          )}
                          style={{ height: `${h}%` }}
                        >
                          <span className="absolute -top-[16px] left-1/2 -translate-x-1/2 text-[11px] font-bold tabular-nums">
                            {v == null ? "—" : Math.round(v)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-2 pl-20 pr-1 pt-1.5">
            {COMPOSITE_AXES.map((axis) => (
              <span
                key={axis}
                className={cn(
                  "flex-1 text-center text-[10px]",
                  cs.lowestAxis === axis ? "font-bold text-warn" : "text-muted-foreground"
                )}
              >
                {axis}
              </span>
            ))}
          </div>
        </div>
        </Selectable>
      )}

      <Selectable id="ov-stats" label="핵심 지표" kind="data">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="최근 매출" value={formatKRW(company.revenueLatest)} />
        <StatCard label="누적 지원금" value={formatKRW(company.support.총지원금_천원)} sub={`${company.support.건수 ?? 0}건`} />
        <StatCard label="1인당 평균급여" value={formatKRW(company.avgSalaryLatest)} />
        <StatCard label="마지막 선정연도" value={lastSelectedYear ?? "-"} />
      </div>
      </Selectable>

      <Selectable id="ov-certs" label="보유 인증" kind="data">
      <div>
        <p className="mb-2.5 text-[12.5px] font-bold">보유 인증</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(company.certifications).map(([k, has]) => (
            <Badge key={k} variant={has ? "good" : "secondary"} className={!has ? "opacity-50" : undefined}>
              {k}
            </Badge>
          ))}
        </div>
      </div>
      </Selectable>

      <Selectable id="ov-tech-stats" label="특허·NTIS·지원 이력" kind="data">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="특허(등록/출원)" value={`${company.patents.등록 ?? 0} / ${company.patents.출원 ?? 0}`} />
        <StatCard label="NTIS(주관/위탁)" value={`${company.ntis.주관 ?? 0} / ${company.ntis.위탁 ?? 0}`} />
        <StatCard label="지원 이력" value={`${company.support.건수 ?? 0}건`} sub={`${company.support.지원연도수 ?? 0}개년`} />
      </div>
      </Selectable>

      <Selectable id="ov-fit" label="사업정체성 정합성" kind="data">
      <BusinessFitCard
        fit={company.businessFit}
        compact
        hasSupportHistory={(company.supportHistory ?? []).length > 0}
      />
      </Selectable>
    </div>
  );
}

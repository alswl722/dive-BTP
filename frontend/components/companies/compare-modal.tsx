"use client";

import { Check, X } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { AXES, type Axis, type Company, type CompositeGroup } from "@/types";
import { Card } from "@/components/ui/card";
import { ScoreBadge } from "@/components/ui/score-badge";
import { resolveOverallScore, DEFAULT_TECH_WEIGHTS, type TechAxis } from "@/lib/scoring";
import { formatKRW, cn } from "@/lib/utils";

const COMPARE_COLORS = ["hsl(var(--info))", "hsl(var(--good))", "hsl(var(--axis-efficiency))", "hsl(var(--bad))"];

interface Row {
  label: string;
  value: (c: Company) => number | null;
  fmt: (v: number | null) => string;
}

export function CompareModal({
  companies,
  weights,
  groupWeights,
  techWeights = DEFAULT_TECH_WEIGHTS,
  onRemove,
  onClose,
}: {
  companies: Company[];
  weights: Record<Axis, number>;
  groupWeights: Record<CompositeGroup, number>;
  techWeights?: Record<TechAxis, number>;
  onRemove: (id: number) => void;
  onClose: () => void;
}) {
  const rows: Row[] = [
    { label: "종합점수", value: (c) => resolveOverallScore(c, groupWeights, weights, techWeights), fmt: (v) => (v == null ? "—" : `${Math.round(v)}점`) },
    { label: "최근매출", value: (c) => c.revenueLatest, fmt: (v) => formatKRW(v) },
    { label: "누적지원금", value: (c) => c.support.총지원금_천원, fmt: (v) => formatKRW(v) },
    { label: "지원건수", value: (c) => c.support.건수, fmt: (v) => (v == null ? "—" : `${v}건`) },
    ...AXES.map((axis) => ({
      label: axis,
      value: (c: Company) => c.scores[axis],
      fmt: (v: number | null) => (v == null ? "—" : Math.round(v).toString()),
    })),
  ];

  const radarData = AXES.map((axis) => {
    const row: Record<string, string | number> = { axis };
    companies.forEach((c) => (row[String(c.id)] = c.scores[axis] ?? 0));
    return row;
  });

  const certKeys = Object.keys(companies[0]?.certifications ?? {});

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-6">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-card shadow-modal">
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
          <div>
            <p className="text-[16px] font-bold">기업 비교</p>
            <p className="text-[11.5px] text-muted-foreground">{companies.length}개사 나란히 비교</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto p-5">
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${companies.length}, minmax(0,1fr))` }}>
            {companies.map((c) => (
              <Card key={c.id} className="relative flex items-center gap-2.5 p-3">
                <button
                  onClick={() => onRemove(c.id)}
                  className="absolute right-2 top-2 rounded-full p-0.5 text-muted-foreground hover:bg-muted"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <ScoreBadge score={resolveOverallScore(c, groupWeights, weights, techWeights)} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-bold">{c.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{c.industry ?? "-"}</p>
                </div>
              </Card>
            ))}
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <Card className="p-4">
              <p className="mb-2 text-[12.5px] font-bold">4축 레이더 비교</p>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData} outerRadius="70%">
                  <PolarGrid stroke="hsl(206 20% 88%)" />
                  <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: "hsl(206 15% 49%)" }} />
                  {companies.map((c, i) => (
                    <Radar
                      key={c.id}
                      dataKey={String(c.id)}
                      name={c.name}
                      stroke={COMPARE_COLORS[i % COMPARE_COLORS.length]}
                      fill={COMPARE_COLORS[i % COMPARE_COLORS.length]}
                      fillOpacity={0.12}
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                  ))}
                </RadarChart>
              </ResponsiveContainer>
              <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1">
                {companies.map((c, i) => (
                  <span key={c.id} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="h-2 w-2 rounded-full" style={{ background: COMPARE_COLORS[i % COMPARE_COLORS.length] }} />
                    {c.name}
                  </span>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <p className="mb-2 text-[12.5px] font-bold">축별 점수 비교</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={radarData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(206 20% 92%)" vertical={false} />
                  <XAxis dataKey="axis" tick={{ fontSize: 11 }} stroke="hsl(206 15% 60%)" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(206 15% 60%)" width={30} />
                  {companies.map((c, i) => (
                    <Bar key={c.id} dataKey={String(c.id)} name={c.name} fill={COMPARE_COLORS[i % COMPARE_COLORS.length]} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-3 text-left font-medium text-muted-foreground">항목</th>
                {companies.map((c) => (
                  <th key={c.id} className="py-2 text-center font-medium text-muted-foreground">
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const values = companies.map((c) => row.value(c));
                const max = Math.max(...values.filter((v): v is number => v != null));
                return (
                  <tr key={row.label} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium text-muted-foreground">{row.label}</td>
                    {companies.map((c, i) => {
                      const v = values[i];
                      const isMax = v != null && v === max && values.some((x) => x != null && x !== max);
                      return (
                        <td key={c.id} className={cn("py-2 text-center tabular-nums", isMax && "font-bold text-good")}>
                          {row.fmt(v)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div>
            <p className="mb-2 text-[12.5px] font-bold">인증 비교</p>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b">
                  <th className="py-2 pr-3 text-left font-medium text-muted-foreground">인증</th>
                  {companies.map((c) => (
                    <th key={c.id} className="py-2 text-center font-medium text-muted-foreground">
                      {c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {certKeys.map((cert) => (
                  <tr key={cert} className="border-b last:border-0">
                    <td className="py-2 pr-3 text-muted-foreground">{cert}</td>
                    {companies.map((c) => (
                      <td key={c.id} className="py-2 text-center">
                        {c.certifications[cert] ? (
                          <Check className="mx-auto h-3.5 w-3.5 text-good" />
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

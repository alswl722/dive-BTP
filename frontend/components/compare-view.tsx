"use client";

import { useState } from "react";
import Link from "next/link";
import { X, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ScoreBar } from "@/components/ui/score-bar";
import { Badge } from "@/components/ui/badge";
import { formatKRW } from "@/lib/utils";
import { AXES, type Company } from "@/types";

export function CompareView({ companies }: { companies: Company[] }) {
  const [selected, setSelected] = useState<number[]>(companies.slice(0, 2).map((c) => c.id));
  const picked = selected.map((id) => companies.find((c) => c.id === id)!).filter(Boolean);
  const canAdd = selected.length < 4;
  const available = companies.filter((c) => !selected.includes(c.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {picked.map((c) => (
          <Badge key={c.id} variant="secondary" className="gap-1 py-1">
            {c.name}
            {picked.length > 2 && (
              <button onClick={() => setSelected((s) => s.filter((id) => id !== c.id))}><X className="h-3 w-3" /></button>
            )}
          </Badge>
        ))}
        {canAdd && available.length > 0 && (
          <select
            onChange={(e) => e.target.value && setSelected((s) => [...s, Number(e.target.value)])}
            value=""
            className="rounded-md border bg-card px-2 py-1 text-sm text-muted-foreground"
          >
            <option value="">+ 기업 추가 (최대 4)</option>
            {available.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.industry}</option>)}
          </select>
        )}
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${picked.length}, minmax(0,1fr))` }}>
        {picked.map((c) => {
          const total = c.supportHistory.length;
          const sel = c.supportHistory.filter((r) => r.result === "선정").length;
          return (
            <Card key={c.id}>
              <CardContent className="space-y-4 pt-5">
                <div>
                  <Link href={`/companies/${c.id}`} className="font-semibold text-primary hover:underline">{c.name}</Link>
                  <p className="text-xs text-muted-foreground">{c.industry}</p>
                </div>
                <div className="space-y-2.5">
                  {AXES.map((a) => <ScoreBar key={a} label={a} value={c.scores[a]} />)}
                </div>
                <dl className="space-y-1 border-t pt-3 text-sm">
                  <Row label="선정률" value={total ? `${Math.round((sel / total) * 100)}% (${sel}/${total})` : "-"} />
                  <Row label="누적 지원금" value={formatKRW(c.support.총지원금_천원)} />
                  <Row label="지원 건수" value={`${c.support.건수 ?? 0}회`} />
                </dl>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

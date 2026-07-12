"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { AXES, type Company } from "@/types";
import { cn, scoreTone } from "@/lib/utils";

const toneText: Record<string, string> = { good: "text-good", warn: "text-warn", bad: "text-bad", muted: "text-muted-foreground" };

export function CompanyList({ companies }: { companies: Company[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return companies;
    return companies.filter(
      (c) => String(c.id).includes(s) || c.name.toLowerCase().includes(s) || (c.industry ?? "").toLowerCase().includes(s)
    );
  }, [q, companies]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="기업번호 · 업종 검색"
          className="w-full rounded-md border bg-card py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
        />
      </div>
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>기업</TH>
              <TH>업종</TH>
              {AXES.map((a) => <TH key={a} className="text-right">{a}</TH>)}
            </TR>
          </THead>
          <TBody>
            {filtered.map((c) => (
              <TR key={c.id}>
                <TD>
                  <Link href={`/companies/${c.id}`} className="font-medium text-primary hover:underline">
                    {c.name}
                  </Link>
                </TD>
                <TD className="text-muted-foreground">{c.industry ?? "-"}</TD>
                {AXES.map((a) => {
                  const v = c.scores[a];
                  return (
                    <TD key={a} className={cn("text-right tabular-nums font-medium", toneText[scoreTone(v)])}>
                      {v == null ? "—" : Math.round(v)}
                    </TD>
                  );
                })}
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Company } from "@/types";
import { getRecentlyViewed } from "@/lib/recently-viewed";
import { computeOverallScore } from "@/lib/scoring";
import { ScoreBadge } from "@/components/ui/score-badge";

export function RecentlyViewedPanel({ companies }: { companies: Company[] }) {
  const [ids, setIds] = useState<number[] | null>(null);

  useEffect(() => {
    setIds(getRecentlyViewed());
  }, []);

  if (ids === null) return null; // 하이드레이션 전에는 로컬스토리지를 못 읽으므로 스켈레톤 없이 스킵

  const recent = ids.map((id) => companies.find((c) => c.id === id)).filter((c): c is Company => !!c);

  if (recent.length === 0) {
    return <p className="text-[12px] text-muted-foreground">최근 조회한 기업이 여기에 표시됩니다.</p>;
  }

  return (
    <div className="space-y-1">
      {recent.map((c) => (
        <Link
          key={c.id}
          href={`/companies/${c.id}`}
          className="flex items-center gap-2.5 rounded-md px-1.5 py-2 hover:bg-muted"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-info-bg text-[11px] font-bold text-info">
            {c.name.slice(-2)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-medium">{c.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{c.industry ?? "업종 미상"}</p>
          </div>
          <ScoreBadge score={computeOverallScore(c.scores)} size="sm" />
        </Link>
      ))}
    </div>
  );
}

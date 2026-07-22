"use client";

import Link from "next/link";
import type { Company } from "@/types";
import { useFavorites } from "@/lib/favorites";
import { resolveOverallScore } from "@/lib/scoring";
import { ScoreBadge } from "@/components/ui/score-badge";
import { FavoriteToggle } from "@/components/companies/favorite-toggle";

/** 메인페이지 "관심 기업" 카드 — 사업 배정·검색 결과와 무관하게 개인이 찜한 기업만 모아 보여준다. */
export function FavoritesPanel({ companies }: { companies: Company[] }) {
  const { favoriteIds } = useFavorites();
  const favorites = favoriteIds.map((id) => companies.find((c) => c.id === id)).filter((c): c is Company => !!c);

  if (favorites.length === 0) {
    return <p className="text-[12px] text-muted-foreground">기업 목록·상세에서 별표를 눌러 관심 기업을 모아보세요.</p>;
  }

  return (
    <div className="space-y-1">
      {favorites.map((c) => (
        <Link
          key={c.id}
          href={`/companies/${c.id}`}
          className="flex items-center gap-2.5 rounded-md px-1.5 py-2 hover:bg-muted"
        >
          <FavoriteToggle companyId={c.id} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-medium">{c.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{c.industry ?? "업종 미상"}</p>
          </div>
          <ScoreBadge score={resolveOverallScore(c)} size="sm" />
        </Link>
      ))}
    </div>
  );
}

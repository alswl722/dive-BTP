"use client";

import { Star } from "lucide-react";
import { useFavorites } from "@/lib/favorites";
import { cn } from "@/lib/utils";

/** 관심 기업 별표 토글 — 기업 목록/보드/스코어카드 어디서든 동일하게 쓴다.
 *  사업 배정·심사 상태와 무관한 개인 북마크라 클릭이 카드 클릭(상세 열기 등)으로
 *  전파되지 않도록 항상 stopPropagation한다. */
export function FavoriteToggle({
  companyId,
  size = "sm",
  className,
}: {
  companyId: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const active = isFavorite(companyId);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        toggleFavorite(companyId);
      }}
      aria-label={active ? "관심 기업에서 제거" : "관심 기업으로 등록"}
      aria-pressed={active}
      title={active ? "관심 기업 해제" : "관심 기업으로 등록"}
      className={cn(
        "shrink-0 rounded-md p-1 transition-colors",
        active ? "text-warn hover:text-warn/80" : "text-muted-foreground/50 hover:text-warn",
        className
      )}
    >
      <Star className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} fill={active ? "currentColor" : "none"} />
    </button>
  );
}

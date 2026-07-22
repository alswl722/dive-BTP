"use client";

// 관심 기업 — 사업 배정·심사 상태(useReviewStatus)와 무관한 개인 북마크.
// 검색이나 조회 중 눈에 띈 기업을 사업 맥락 없이 바로 표시해두고 메인페이지에서 모아본다.
// 로그인 계정별로 분리 저장(동료가 찜한 게 섞여 보이지 않도록) — localStorage만 쓰고
// 서버에는 영속화하지 않는다(개인 취향 수준의 가벼운 기능이라 백엔드 연동 불필요).

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";

const KEY_PREFIX = "btp.favorites.";

function storageKey(username: string | undefined): string | null {
  return username ? `${KEY_PREFIX}${username}` : null;
}

function readIds(key: string | null): number[] {
  if (!key || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

interface FavoritesContextValue {
  favoriteIds: number[];
  isFavorite: (companyId: number) => boolean;
  toggleFavorite: (companyId: number) => void;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);

  // 계정이 바뀌면(로그인/로그아웃/전환) 그 계정의 저장값으로 다시 불러온다.
  useEffect(() => {
    setFavoriteIds(readIds(storageKey(user?.username)));
  }, [user?.username]);

  const toggleFavorite = useCallback(
    (companyId: number) => {
      const key = storageKey(user?.username);
      if (!key) return; // 비로그인 — 저장할 계정이 없으므로 무시
      setFavoriteIds((prev) => {
        const next = prev.includes(companyId) ? prev.filter((id) => id !== companyId) : [companyId, ...prev];
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* 저장 실패해도 이번 세션 상태는 유지 */
        }
        return next;
      });
    },
    [user?.username]
  );

  const isFavorite = useCallback((companyId: number) => favoriteIds.includes(companyId), [favoriteIds]);

  return (
    <FavoritesContext.Provider value={{ favoriteIds, isFavorite, toggleFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites는 FavoritesProvider 안에서만 사용");
  return ctx;
}

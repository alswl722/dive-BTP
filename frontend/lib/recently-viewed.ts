const KEY = "btp-recently-viewed-companies";
const MAX = 8;

export function getRecentlyViewed(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

/** 스코어카드 방문 시 호출 — 실제 조회 이력(모의값 아님)을 브라우저 로컬에 누적. */
export function pushRecentlyViewed(id: number) {
  if (typeof window === "undefined") return;
  const cur = getRecentlyViewed().filter((v) => v !== id);
  const next = [id, ...cur].slice(0, MAX);
  window.localStorage.setItem(KEY, JSON.stringify(next));
}

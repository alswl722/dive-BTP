// 브라우저는 NEXT_PUBLIC_API_BASE_URL(docker 네트워크 전용 호스트명)을 직접 못 찾는다 —
// 이 라우트 핸들러는 Next 서버(프론트 컨테이너 안)에서 실행되므로 그 값을 쓸 수 있다.
// (review-status 라우트와 동일한 우회.)
import { NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;
const NO_DB = { error: "API_BASE_URL 미설정(fixture 모드) — 서버에 영속화할 수 없음" };

export async function POST(request: Request) {
  if (!API_BASE) return NextResponse.json(NO_DB, { status: 501 });
  const res = await fetch(`${API_BASE}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

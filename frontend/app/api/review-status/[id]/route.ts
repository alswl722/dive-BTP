// 브라우저(클라이언트)는 docker 네트워크 전용 호스트명(NEXT_PUBLIC_API_BASE_URL=http://backend:8000)을
// 못 찾는다 — 그 값은 프론트 컨테이너 "안"에서 하는 SSR fetch용이다(docker-compose.yml 주석 참고).
// 이 라우트 핸들러는 Next.js 서버(=프론트 컨테이너 안)에서 실행되므로 그 값을 그대로 쓸 수 있고,
// 클라이언트는 같은 오리진의 이 경로만 호출하면 되게 해서 문제를 우회한다.
import { NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!API_BASE) {
    return NextResponse.json({ error: "API_BASE_URL 미설정(fixture 모드) — 서버에 영속화할 수 없음" }, { status: 501 });
  }
  const body = await request.text();
  const res = await fetch(`${API_BASE}/companies/${id}/review-status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

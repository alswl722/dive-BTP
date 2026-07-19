// 챗봇은 서버에서 DeepSeek을 호출하므로 fixture 모드에서는 사용 불가.
// notes/route.ts와 같은 패턴 — 브라우저는 NEXT_PUBLIC_API_BASE_URL(docker 호스트명)을
// 직접 못 찾으므로 같은 오리진 라우트 핸들러(Next 서버 안)로 프록시.
import { NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;
const NO_DB = { error: "API_BASE_URL 미설정 — 챗봇은 백엔드 연결 시에만 동작합니다." };

export async function POST(request: Request) {
  if (!API_BASE) return NextResponse.json(NO_DB, { status: 501 });
  const res = await fetch(`${API_BASE}/chatbot/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

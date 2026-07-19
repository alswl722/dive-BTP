import { NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;
const NO_DB = { error: "API_BASE_URL 미설정(fixture 모드) — 서버에 영속화할 수 없음" };

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!API_BASE) return NextResponse.json(NO_DB, { status: 501 });
  const { id } = await params;
  const res = await fetch(`${API_BASE}/notes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!API_BASE) return NextResponse.json(NO_DB, { status: 501 });
  const { id } = await params;
  const res = await fetch(`${API_BASE}/notes/${id}`, { method: "DELETE" });
  return new NextResponse(null, { status: res.status });
}

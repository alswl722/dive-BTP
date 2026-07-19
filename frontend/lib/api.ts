// 타입드 데이터 클라이언트.
// NEXT_PUBLIC_API_BASE_URL 있으면 FastAPI fetch, 없으면 로컬 fixture.
// 화면 코드는 데이터 출처를 모른다(우리 parquet→DB 철학과 동일).

import type { ChatbotAnswer, Company, Rankings, Dashboard, Note, Program } from "@/types";
import companiesFixture from "./fixtures/companies.json";
import rankingsFixture from "./fixtures/rankings.json";
import dashboardFixture from "./fixtures/dashboard.json";
import programsFixture from "./fixtures/programs.json";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

const companies = companiesFixture as unknown as Company[];

async function fromApi<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json();
}

export async function listCompanies(): Promise<Company[]> {
  if (API_BASE) return fromApi<Company[]>("/companies");
  return companies;
}

export async function getCompany(id: number): Promise<Company | null> {
  if (API_BASE) return fromApi<Company>(`/companies/${id}`);
  return companies.find((c) => c.id === id) ?? null;
}

export async function getRankings(): Promise<Rankings> {
  if (API_BASE) return fromApi<Rankings>("/rankings");
  return rankingsFixture as unknown as Rankings;
}

export async function getDashboard(): Promise<Dashboard> {
  if (API_BASE) return fromApi<Dashboard>("/dashboard");
  return dashboardFixture as unknown as Dashboard;
}

export async function listPrograms(): Promise<Program[]> {
  if (API_BASE) return fromApi<Program[]>("/programs");
  return programsFixture as unknown as Program[];
}

/** 찜 상태(선정/보류/제외) 갱신. API_BASE 있으면 DB(company_review_status)에 영속화,
 *  없으면(fixture 모드) 호출부가 들고 있는 클라이언트 상태만 세션 내 갱신하도록 false 반환.
 *  브라우저는 NEXT_PUBLIC_API_BASE_URL(docker 네트워크 전용 호스트명)을 직접 못 찾으므로
 *  같은 오리진의 /api/review-status 라우트 핸들러(서버에서 실행)를 거친다. */
export async function updateReviewStatus(id: number, status: Company["reviewStatus"]): Promise<boolean> {
  if (!API_BASE) return false;
  const res = await fetch(`/api/review-status/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`PATCH review-status ${id} → ${res.status}`);
  return true;
}

/* ------------------------------------------------------------------ */
/* 메모 — 찜 상태와 같은 정책: DB 없으면(fixture 모드) 세션 내 상태만 유지 */
/* ------------------------------------------------------------------ */

/** DB 영속화 가능 여부. false면 화면에 "저장되지 않음" 안내를 띄운다. */
export const notesPersisted = Boolean(API_BASE);

export async function listNotes(params?: {
  companyId?: number;
  programYear?: number;
  programCode?: string;
}): Promise<Note[]> {
  if (!API_BASE) return [];
  const q = new URLSearchParams();
  if (params?.companyId != null) q.set("companyId", String(params.companyId));
  if (params?.programYear != null) q.set("programYear", String(params.programYear));
  if (params?.programCode) q.set("programCode", params.programCode);
  const suffix = q.toString() ? `?${q}` : "";
  return fromApi<Note[]>(`/notes${suffix}`);
}

async function notesApi<T>(path: string, init: RequestInit): Promise<T | null> {
  if (!API_BASE) return null; // fixture 모드 — 호출부가 세션 상태만 갱신
  const res = await fetch(`/api/notes${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`${init.method} /api/notes${path} → ${res.status}`);
  return res.status === 204 ? (null as T) : res.json();
}

export function createNote(body: string, author: string) {
  return notesApi<Note>("", { method: "POST", body: JSON.stringify({ body, author }) });
}

export function updateNote(id: number, body: string) {
  return notesApi<Note>(`/${id}`, { method: "PATCH", body: JSON.stringify({ body }) });
}

export function deleteNote(id: number) {
  return notesApi<null>(`/${id}`, { method: "DELETE" });
}

/* ------------------------------------------------------------------ */
/* 챗봇 — 자연어 질문 → DeepSeek 텍스트투SQL. API_BASE 없으면 사용 불가. */
/* ------------------------------------------------------------------ */

export const chatbotAvailable = Boolean(API_BASE);

export async function askChatbot(question: string): Promise<ChatbotAnswer> {
  if (!API_BASE) {
    throw new Error("챗봇은 백엔드 연결 시에만 동작합니다(fixture 모드 미지원).");
  }
  const res = await fetch("/api/chatbot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // FastAPI 검증실패는 {detail: "..."} 형태
    const msg = data?.detail || data?.error || `요청 실패(${res.status})`;
    throw new Error(msg);
  }
  return data as ChatbotAnswer;
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2, X } from "lucide-react";
import type { Company, Program } from "@/types";
import { useAdminState } from "@/lib/admin-state";
import { useAuth, isAdmin } from "@/lib/auth";
import { useReviewStatus } from "@/lib/app-state";
import { latestSupportYear } from "@/lib/duplicate-risk";
import { programApplicantIds, programKey } from "@/lib/program-progress";
import { toCsv, downloadCsv } from "@/lib/export";
import { savePdfReport } from "@/lib/pdf";
import { saveDocx } from "@/lib/docx-report";
import { REPORT_BLOCKS, type ReportItem } from "@/lib/report-blocks";
import { ReportSelectProvider } from "@/lib/report-select";
import { ScorecardPanel, TAB_LIST } from "@/components/scorecard/scorecard-panel";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const escId = (id: string) => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"'));
const showVal = (v: string | number | null | undefined) => (v == null || v === "" ? "-" : String(v));

/**
 * 리포트 편집 빌더 — 왼쪽=실제 기업 상세페이지(블록별 담기 체크), 오른쪽=담긴 항목 미리보기.
 * 데이터 블록은 원본 데이터를 그대로 표로 렌더(선명), 차트 블록만 이미지로 캡처.
 * PDF(표+차트) / Word(.docx, 편집가능) / CSV(데이터만 — 차트 담기면 안내) 저장.
 */
export function CompanyReportBuilder({
  companies,
  programs,
  onClose,
}: {
  companies: Company[];
  programs: Program[];
  onClose: () => void;
}) {
  const { assigns } = useAdminState();
  const { user } = useAuth();
  const { statusOf, reasonOf } = useReviewStatus();
  const { toast } = useToast();
  const admin = isAdmin(user);
  const latestYear = useMemo(() => latestSupportYear(companies), [companies]);
  const leftRef = useRef<HTMLDivElement>(null);
  void statusOf; void reasonOf;

  const myPrograms = useMemo(
    () => programs.filter((p) => p.applicantCount > 0 && (admin || assigns[programKey(p)] === user?.username)),
    [programs, assigns, admin, user]
  );

  const [progKey, setProgKey] = useState<string>(() => (myPrograms[0] ? programKey(myPrograms[0]) : ""));
  const program = myPrograms.find((p) => programKey(p) === progKey) ?? null;

  const applicants = useMemo(() => {
    if (!program) return [] as Company[];
    const ids = new Set(programApplicantIds(program, companies));
    return companies.filter((c) => ids.has(c.id));
  }, [program, companies]);

  const [companyId, setCompanyId] = useState<number | null>(null);
  const company = applicants.find((c) => c.id === companyId) ?? null;

  const [order, setOrder] = useState<string[]>([]);
  const [charts, setCharts] = useState<Record<string, { dataUrl: string; w: number; h: number }>>({});
  const [capturing, setCapturing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const [activeTab, setActiveTab] = useState<string>("개요");

  useEffect(() => setCompanyId(applicants[0]?.id ?? null), [progKey, applicants.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setOrder([]);
    setCharts({});
    if (company) setFileName(`${company.name} 리포트`);
  }, [company?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // html2canvas로 DOM 블록을 이미지로 캡처(담기 버튼 제외)
  async function captureEl(el: HTMLElement) {
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: "#ffffff",
        logging: false,
        ignoreElements: (node) => node.getAttribute?.("data-report-btn") != null,
      });
      return { dataUrl: canvas.toDataURL("image/png"), w: canvas.width, h: canvas.height };
    } catch {
      return null;
    }
  }

  const waitRender = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => window.setTimeout(r, 220))));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selectedSet = useMemo(() => new Set(order), [order]);

  async function toggle(id: string) {
    const def = REPORT_BLOCKS[id];
    if (!def) return;
    if (selectedSet.has(id)) {
      setOrder((o) => o.filter((x) => x !== id));
      setCharts((c) => { const n = { ...c }; delete n[id]; return n; });
      return;
    }
    // 데이터 블록은 캡처 없이 바로 담김(원본 데이터로 렌더)
    if (def.kind === "data") {
      setOrder((o) => [...o, id]);
      return;
    }
    // 차트 블록만 이미지 캡처
    const el = leftRef.current?.querySelector<HTMLElement>(`[data-report-id="${escId(id)}"]`);
    if (!el) return;
    setCapturing(true);
    const meta = await captureEl(el);
    setCapturing(false);
    if (!meta) { toast("차트 캡처에 실패했습니다.", "error"); return; }
    setCharts((c) => ({ ...c, [id]: meta }));
    setOrder((o) => (o.includes(id) ? o : [...o, id]));
  }

  // 전체 담기 — 모든 탭을 순회하며 각 탭의 블록을 담는다(차트는 캡처).
  async function addAll() {
    if (!company) return;
    setCapturing(true);
    const newOrder = [...order];
    const newCharts = { ...charts };
    const has = new Set(newOrder);
    try {
      for (const t of TAB_LIST) {
        setActiveTab(t);
        await waitRender();
        const nodes = Array.from(leftRef.current?.querySelectorAll<HTMLElement>("[data-report-id]") ?? []);
        for (const el of nodes) {
          const id = el.dataset.reportId;
          if (!id || has.has(id)) continue;
          const def = REPORT_BLOCKS[id];
          if (!def) continue;
          if (def.kind === "chart") {
            const meta = await captureEl(el);
            if (!meta) continue;
            newCharts[id] = meta;
          }
          newOrder.push(id);
          has.add(id);
        }
      }
      setOrder(newOrder);
      setCharts(newCharts);
      toast(`${newOrder.length}개 항목을 담았습니다.`);
    } finally {
      setCapturing(false);
    }
  }

  function clearAll() {
    setOrder([]);
    setCharts({});
  }

  // 담긴 항목 → 최종 아이템(데이터 섹션 / 차트 이미지)
  const items: ReportItem[] = useMemo(() => {
    if (!company) return [];
    return order
      .map((id): ReportItem | null => {
        const def = REPORT_BLOCKS[id];
        if (!def) return null;
        if (def.kind === "data") return { type: "section", section: def.data(company) };
        const img = charts[id];
        return img ? { type: "image", label: def.label, ...img } : null;
      })
      .filter((x): x is ReportItem => x != null);
  }, [order, charts, company]);

  const pickedCount = items.length;
  const hasChart = order.some((id) => REPORT_BLOCKS[id]?.kind === "chart");
  const cleanName = () => fileName.trim().replace(/\.(pdf|csv|docx)$/i, "") || `${company?.name ?? "리포트"} 리포트`;

  async function withBusy(fn: () => Promise<void> | void) {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  }

  function exportPdf() {
    if (pickedCount === 0 || !company) return;
    withBusy(() =>
      savePdfReport(cleanName(), company.name, company.industry ?? undefined, items)
        .then(() => toast(`${cleanName()}.pdf 다운로드 완료`))
        .catch(() => toast("PDF 생성에 실패했습니다.", "error"))
    );
  }

  function exportDocx() {
    if (pickedCount === 0 || !company) return;
    withBusy(() =>
      saveDocx(cleanName(), company.name, company.industry ?? undefined, items)
        .then(() => toast(`${cleanName()}.docx 다운로드 완료`))
        .catch(() => toast("Word 생성에 실패했습니다.", "error"))
    );
  }

  function exportCsv() {
    if (!company) return;
    if (hasChart) {
      toast("이미지(차트) 항목은 CSV에 담을 수 없습니다. 차트 선택을 해제한 뒤 다시 시도하세요.", "error");
      return;
    }
    if (pickedCount === 0) {
      toast("담은 항목이 없습니다.", "info");
      return;
    }
    const rows = items.flatMap((it) =>
      it.type === "section" ? it.section.rows.map(([k, v]) => [it.section.heading, k, showVal(v)] as string[]) : []
    );
    downloadCsv(cleanName(), toCsv(["구분", "항목", "값"], rows));
    toast(`${cleanName()}.csv 다운로드 완료`);
  }

  const Btn = ({ onClick, disabled, primary, icon, children }: { onClick: () => void; disabled?: boolean; primary?: boolean; icon: React.ReactNode; children: React.ReactNode }) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
        disabled ? "bg-muted text-muted-foreground" : primary ? "bg-primary text-primary-foreground hover:opacity-90" : "border hover:bg-muted"
      )}
    >
      {icon}
      {children}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* 상단 바 */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-2.5">
        <p className="text-[13px] font-bold">리포트 편집</p>
        <select value={progKey} onChange={(e) => setProgKey(e.target.value)} className="rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary">
          {myPrograms.length === 0 && <option value="">배정된 사업 없음</option>}
          {myPrograms.map((p) => <option key={programKey(p)} value={programKey(p)}>{p.year} · {p.name ?? p.programCode}</option>)}
        </select>
        <select value={companyId ?? ""} onChange={(e) => setCompanyId(Number(e.target.value))} className="min-w-[140px] rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary">
          {applicants.length === 0 && <option value="">신청 기업 없음</option>}
          {applicants.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {(capturing || busy) && <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {capturing ? "캡처 중…" : "생성 중…"}</span>}

        <div className="ml-auto flex items-center gap-2">
          <input value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="파일 이름" className="w-40 rounded-md border bg-background px-2.5 py-1.5 text-[12px] outline-none focus:border-primary" />
          <Btn onClick={exportCsv} icon={<FileSpreadsheet className="h-3.5 w-3.5" />}>CSV</Btn>
          <Btn onClick={exportDocx} disabled={pickedCount === 0 || busy} icon={<FileText className="h-3.5 w-3.5" />}>Word</Btn>
          <Btn onClick={exportPdf} disabled={pickedCount === 0 || busy} primary icon={<Download className="h-3.5 w-3.5" />}>PDF</Btn>
          <button onClick={onClose} aria-label="닫기" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
      </div>

      {/* 좌우 분할 */}
      <div className="grid min-h-0 flex-1 grid-cols-2 divide-x">
        {/* 왼쪽: 실제 기업 상세페이지 (선택모드) */}
        <div ref={leftRef} className="min-h-0 overflow-y-auto p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11.5px] text-muted-foreground">
              각 블록 우측 상단 <b className="text-foreground">담기</b>/<b className="text-foreground">이미지</b> 버튼으로 담기. 탭을 넘겨가며 담을 수 있어요.
            </p>
            <div className="flex shrink-0 gap-1.5">
              <button type="button" onClick={addAll} disabled={capturing || !company} className="rounded-md border px-2.5 py-1 text-[11.5px] font-medium hover:bg-muted disabled:opacity-50">전체 담기</button>
              <button type="button" onClick={clearAll} className="rounded-md px-2 py-1 text-[11.5px] text-muted-foreground hover:bg-muted">전체 해제</button>
            </div>
          </div>
          {company ? (
            <ReportSelectProvider value={{ active: true, selected: selectedSet, toggle }}>
              <ScorecardPanel company={company} latestYear={latestYear} programKey={program ? programKey(program) : null} tab={activeTab} onTabChange={setActiveTab} />
            </ReportSelectProvider>
          ) : (
            <p className="py-10 text-center text-[12.5px] text-muted-foreground">기업을 선택하세요.</p>
          )}
        </div>

        {/* 오른쪽: 담긴 항목 미리보기 (데이터=표, 차트=이미지) = 저장물과 동일 */}
        <div className="min-h-0 overflow-y-auto bg-muted/20 p-4">
          <p className="mb-2 text-[12px] font-bold text-muted-foreground">
            담긴 항목 · {pickedCount}개{hasChart && <span className="ml-1 font-normal text-[11px]">(차트 포함 — CSV 불가)</span>}
          </p>
          {pickedCount === 0 ? (
            <p className="py-10 text-center text-[12.5px] text-muted-foreground">왼쪽에서 담을 블록을 선택하세요.</p>
          ) : (
            <div className="mx-auto max-w-[600px] rounded-lg border bg-card p-5 shadow-card">
              <p className="text-[16px] font-extrabold">{company?.name}</p>
              {company?.industry && <p className="mb-3 text-[12px] text-muted-foreground">{company.industry}</p>}
              <div className="space-y-4">
                {order.map((id) => {
                  const def = REPORT_BLOCKS[id];
                  if (!def) return null;
                  return (
                    <div key={id} className="group relative">
                      <button onClick={() => toggle(id)} className="absolute -right-1 -top-1 z-10 rounded p-0.5 text-muted-foreground opacity-0 hover:bg-bad-bg hover:text-bad group-hover:opacity-100" aria-label="빼기">
                        <X className="h-3.5 w-3.5" />
                      </button>
                      {def.kind === "data" ? (
                        (() => {
                          const sec = def.data(company!);
                          return (
                            <div>
                              <p className="mb-1 border-b-2 border-primary pb-1 text-[13px] font-bold text-primary">{sec.heading}</p>
                              <table className="w-full text-[12px]">
                                <tbody>
                                  {sec.rows.map(([label, val], ri) => (
                                    <tr key={ri} className="border-b last:border-b-0">
                                      <th className="w-[38%] py-1.5 pr-2 text-left font-medium text-muted-foreground">{label}</th>
                                      <td className="py-1.5">{showVal(val)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          );
                        })()
                      ) : (
                        <div>
                          <p className="mb-1 border-b-2 border-primary pb-1 text-[13px] font-bold text-primary">{def.label} <span className="text-[10.5px] font-normal text-muted-foreground">· 이미지</span></p>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {charts[id] && <img src={charts[id].dataUrl} alt={def.label} className="block w-full rounded border" />}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

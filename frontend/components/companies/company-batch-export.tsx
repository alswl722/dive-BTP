"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, FileSpreadsheet, FileText, Printer, X } from "lucide-react";
import type { Company, Program } from "@/types";
import { useAdminState } from "@/lib/admin-state";
import { useAuth, isAdmin } from "@/lib/auth";
import { useReviewStatus } from "@/lib/app-state";
import { latestSupportYear } from "@/lib/duplicate-risk";
import { programApplicantIds, programKey } from "@/lib/program-progress";
import { companySections, companyWideRow, COMPANY_WIDE_HEADERS } from "@/lib/company-report";
import { toCsv, downloadCsv, printReports } from "@/lib/export";
import { savePdfReports } from "@/lib/pdf";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type Format = "csv" | "pdf" | "print";

const FORMAT_META: Record<Format, { label: string; Icon: typeof FileText }> = {
  pdf: { label: "PDF 저장", Icon: FileText },
  csv: { label: "CSV(엑셀)", Icon: FileSpreadsheet },
  print: { label: "인쇄", Icon: Printer },
};

/** 형식별 파일 확장자. print는 파일이 없다. */
const EXT: Record<Format, string> = { pdf: ".pdf", csv: ".csv", print: "" };

/**
 * 심사 결과 배치 내보내기 — 사업을 고르고 그 사업 신청 기업을 골라 상세를 한 파일로.
 *  - PDF: 기업 1개당 1페이지 리포트(개요·재무·기술·지원이력 + 심사 결정).
 *  - CSV: 기업 1개당 1행(모든 지표 가로) — 엑셀 비교/정렬용.
 */
export function CompanyBatchExport({ companies, programs }: { companies: Company[]; programs: Program[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12.5px] font-medium hover:bg-muted"
      >
        <Download className="h-3.5 w-3.5" />
        내보내기
      </button>
      {open && <BatchDialog companies={companies} programs={programs} onClose={() => setOpen(false)} />}
    </>
  );
}

function BatchDialog({ companies, programs, onClose }: { companies: Company[]; programs: Program[]; onClose: () => void }) {
  const { assigns } = useAdminState();
  const { user } = useAuth();
  const { statusOf, reasonOf } = useReviewStatus();
  const { toast } = useToast();
  const admin = isAdmin(user);
  const latestYear = useMemo(() => latestSupportYear(companies), [companies]);

  // 내가 배정받은(관리자는 전체) 신청기업 있는 사업
  const myPrograms = useMemo(
    () => programs.filter((p) => p.applicantCount > 0 && (admin || assigns[programKey(p)] === user?.username)),
    [programs, assigns, admin, user]
  );

  const [format, setFormat] = useState<Format>("pdf");
  const [phase, setPhase] = useState<"options" | "name">("options");
  const [fileName, setFileName] = useState("");
  const [progKey, setProgKey] = useState<string>(() => (myPrograms[0] ? programKey(myPrograms[0]) : ""));
  const program = myPrograms.find((p) => programKey(p) === progKey) ?? null;

  // 선택 사업의 신청 기업
  const applicants = useMemo(() => {
    if (!program) return [] as Company[];
    const ids = new Set(programApplicantIds(program, companies));
    return companies.filter((c) => ids.has(c.id));
  }, [program, companies]);

  const [picked, setPicked] = useState<Set<number>>(new Set());
  // 사업을 바꾸면 그 사업 신청기업 전체 선택으로 초기화
  useEffect(() => setPicked(new Set(applicants.map((c) => c.id))), [progKey, applicants.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (phase === "name") setPhase("options");
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, phase]);

  const chosen = applicants.filter((c) => picked.has(c.id));
  const allPicked = applicants.length > 0 && picked.size === applicants.length;

  function toggle(id: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const baseName = () => `${(program?.name ?? program?.programCode ?? "심사 결과")} 심사 결과`;

  // 내보내기 버튼 — 인쇄는 파일이 없어 바로 실행, 파일 형식은 이름 입력 단계로.
  function goExport() {
    if (!program || chosen.length === 0) return;
    if (format === "print") {
      const decisionOf = (c: Company) => ({ status: statusOf(c.id, programKey(program)), reason: reasonOf(c.id, programKey(program)) });
      const docs = chosen.map((c) => ({ name: c.name, subtitle: c.industry ?? undefined, sections: companySections(c, latestYear, decisionOf(c)) }));
      printReports(baseName(), docs);
      onClose();
      toast(`${chosen.length}개사 인쇄 창을 열었습니다.`, "info");
      return;
    }
    setFileName(baseName());
    setPhase("name");
  }

  function confirmDownload() {
    if (!program || chosen.length === 0) return;
    const pk = programKey(program);
    const decisionOf = (c: Company) => ({ status: statusOf(c.id, pk), reason: reasonOf(c.id, pk) });
    const name = fileName.trim().replace(/\.(csv|pdf)$/i, "") || baseName();
    const count = chosen.length;
    onClose();
    if (format === "csv") {
      const rows = chosen.map((c) => companyWideRow(c, latestYear, decisionOf(c)));
      downloadCsv(name, toCsv(COMPANY_WIDE_HEADERS, rows));
      toast(`${count}개사 · ${name}.csv 다운로드 완료`);
    } else {
      const docs = chosen.map((c) => ({ name: c.name, subtitle: c.industry ?? undefined, sections: companySections(c, latestYear, decisionOf(c)) }));
      savePdfReports(name, docs)
        .then(() => toast(`${count}개사 · ${name}.pdf 다운로드 완료`))
        .catch(() => toast("PDF 생성에 실패했습니다.", "error"));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-6">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl bg-card p-5 shadow-modal">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="text-[13px] font-bold">심사 결과 내보내기</p>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">사업과 기업을 골라 상세 지표를 한 파일로 저장합니다.</p>
          </div>
          <button onClick={onClose} aria-label="닫기" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {phase === "options" ? (
        <>
        <div className="space-y-3">
          <label className="space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">형식</span>
            <div className="flex rounded-md border p-0.5">
              {(["pdf", "csv", "print"] as const).map((f) => {
                const { label, Icon } = FORMAT_META[f];
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormat(f)}
                    className={cn(
                      "inline-flex flex-1 items-center justify-center gap-1.5 rounded px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                      format === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>
          </label>

          <label className="space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">사업</span>
            <select
              value={progKey}
              onChange={(e) => setProgKey(e.target.value)}
              className="w-full rounded-md border bg-background px-2.5 py-2 text-[12.5px] outline-none focus:border-primary"
            >
              {myPrograms.length === 0 && <option value="">배정된 사업 없음</option>}
              {myPrograms.map((p) => (
                <option key={programKey(p)} value={programKey(p)}>
                  {p.year} · {p.name ?? p.programCode} (신청 {p.applicantCount})
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* 기업 다중 선택 */}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground">기업 ({picked.size}/{applicants.length})</span>
          <button
            type="button"
            onClick={() => setPicked(allPicked ? new Set() : new Set(applicants.map((c) => c.id)))}
            className="text-[11.5px] text-primary hover:underline"
          >
            {allPicked ? "전체 해제" : "전체 선택"}
          </button>
        </div>
        <div className="mt-1 min-h-0 flex-1 divide-y overflow-y-auto rounded-lg border">
          {applicants.length === 0 ? (
            <p className="px-3.5 py-6 text-center text-[12px] text-muted-foreground">신청 기업이 없습니다.</p>
          ) : (
            applicants.map((c) => {
              const st = program ? statusOf(c.id, programKey(program)) : "후보";
              return (
                <label key={c.id} className="flex cursor-pointer items-center gap-2.5 px-3.5 py-2 hover:bg-muted/40">
                  <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} className="h-3.5 w-3.5 accent-primary" />
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{c.name}</span>
                  <span className={cn("shrink-0 text-[11px]", st === "선정" ? "text-good" : st === "제외" ? "text-bad" : "text-muted-foreground")}>{st}</span>
                </label>
              );
            })
          )}
        </div>

        <p className="mt-2 text-[11px] text-muted-foreground">
          {format === "pdf"
            ? "PDF는 기업 1개당 1페이지 리포트로 바로 다운로드됩니다."
            : format === "print"
            ? "인쇄 창이 열립니다(기업 1개당 1페이지). 대화상자에서 프린터 또는 'PDF로 저장'을 고르세요."
            : "CSV는 기업 1개당 1행(모든 지표)으로 엑셀에서 열립니다."}
        </p>

        <div className="mt-3 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md px-3.5 py-2 text-[12.5px] text-muted-foreground hover:bg-muted">
            취소
          </button>
          <button
            type="button"
            onClick={goExport}
            disabled={chosen.length === 0}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[12.5px] font-medium transition-colors",
              chosen.length === 0 ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground hover:opacity-90"
            )}
          >
            {format === "print" ? <Printer className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
            {chosen.length}개사 {format === "print" ? "인쇄" : "내보내기"}
          </button>
        </div>
        </>
        ) : (
        <>
          <label className="space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">파일 이름</span>
            <div className="flex items-stretch overflow-hidden rounded-md border focus-within:border-primary">
              <input
                value={fileName}
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setFileName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmDownload()}
                placeholder={baseName()}
                className="min-w-0 flex-1 bg-background px-3 py-2 text-[12.5px] outline-none"
              />
              <span className="flex items-center bg-muted px-2.5 text-[12px] font-medium text-muted-foreground">{EXT[format]}</span>
            </div>
          </label>
          <p className="mt-2 text-[11px] text-muted-foreground">
            확장자 <b className="text-foreground">{EXT[format]}</b>는 자동으로 붙습니다. {chosen.length}개사 저장됩니다.
          </p>
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setPhase("options")}
              className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-[12.5px] text-muted-foreground hover:bg-muted"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              뒤로
            </button>
            <button
              type="button"
              // 한글 IME 조합 중 첫 클릭이 포커스 이동(조합 확정)에 먹히지 않도록 기본동작을 막는다.
              onMouseDown={(e) => e.preventDefault()}
              onClick={confirmDownload}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-[12.5px] font-medium text-primary-foreground transition-colors hover:opacity-90"
            >
              <Download className="h-3.5 w-3.5" />
              다운로드
            </button>
          </div>
        </>
        )}
      </div>
    </div>
  );
}

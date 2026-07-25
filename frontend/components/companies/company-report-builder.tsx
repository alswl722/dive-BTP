"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Printer, X } from "lucide-react";
import type { Company, Program } from "@/types";
import { useAdminState } from "@/lib/admin-state";
import { useAuth, isAdmin } from "@/lib/auth";
import { useReviewStatus } from "@/lib/app-state";
import { latestSupportYear } from "@/lib/duplicate-risk";
import { programApplicantIds, programKey } from "@/lib/program-progress";
import { companySections } from "@/lib/company-report";
import { printReports } from "@/lib/export";
import { savePdfReports } from "@/lib/pdf";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const showVal = (v: string | number | null | undefined) => (v == null || v === "" ? "-" : String(v));

/**
 * 리포트 편집 빌더 — 좌우 분할. 왼쪽=기업 상세(지표별 체크박스), 오른쪽=담긴 항목 미리보기.
 * 체크한 지표만 모아 기업 1개 PDF(1페이지)로 저장. 기업 선정 내보내기에서 '직접 편집'으로 진입.
 * 기본은 전체 체크(전체 리포트에서 빼는 방식) — 전체 해제 후 필요한 것만 담아도 됨.
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

  // 사업을 바꾸면 첫 기업으로
  useEffect(() => {
    setCompanyId(applicants[0]?.id ?? null);
  }, [progKey, applicants.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // 선택 기업의 리포트 섹션(심사 결정 포함)
  const sections = useMemo(() => {
    if (!company || !program) return [];
    const pk = programKey(program);
    return companySections(company, latestYear, { status: statusOf(company.id, pk), reason: reasonOf(company.id, pk) });
  }, [company, program, latestYear, statusOf, reasonOf]);

  // 체크 상태 — 키 `${섹션}:${행}`. 기업/사업 바뀌면 전체 체크로 초기화.
  const [checked, setChecked] = useState<Set<string>>(new Set());
  useEffect(() => {
    const all = new Set<string>();
    sections.forEach((sec, si) => sec.rows.forEach((_, ri) => all.add(`${si}:${ri}`)));
    setChecked(all);
  }, [company?.id, sections.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const [fileName, setFileName] = useState("");
  useEffect(() => {
    if (company) setFileName(`${company.name} 리포트`);
  }, [company?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggleRow(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSection(si: number, on: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      sections[si].rows.forEach((_, ri) => {
        const k = `${si}:${ri}`;
        if (on) next.add(k);
        else next.delete(k);
      });
      return next;
    });
  }

  function setAll(on: boolean) {
    if (!on) return setChecked(new Set());
    const all = new Set<string>();
    sections.forEach((sec, si) => sec.rows.forEach((_, ri) => all.add(`${si}:${ri}`)));
    setChecked(all);
  }

  // 담긴 것만 남긴 섹션(빈 섹션 제외) — 오른쪽 미리보기 · PDF 공통 소스
  const picked = useMemo(
    () =>
      sections
        .map((sec, si) => ({ heading: sec.heading, rows: sec.rows.filter((_, ri) => checked.has(`${si}:${ri}`)) }))
        .filter((sec) => sec.rows.length > 0),
    [sections, checked]
  );
  const pickedCount = picked.reduce((n, s) => n + s.rows.length, 0);

  function buildDoc() {
    if (!company) return null;
    return { name: company.name, subtitle: company.industry ?? undefined, sections: picked };
  }

  function downloadPdf() {
    const doc = buildDoc();
    if (!doc || pickedCount === 0) return;
    const name = fileName.trim().replace(/\.pdf$/i, "") || `${company!.name} 리포트`;
    savePdfReports(name, [doc])
      .then(() => toast(`${name}.pdf 다운로드 완료`))
      .catch(() => toast("PDF 생성에 실패했습니다.", "error"));
  }

  function print() {
    const doc = buildDoc();
    if (!doc || pickedCount === 0) return;
    printReports(`${company!.name} 리포트`, [doc]);
    toast("인쇄 창을 열었습니다.", "info");
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* 상단 바 */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-2.5">
        <p className="text-[13px] font-bold">리포트 편집</p>
        <select
          value={progKey}
          onChange={(e) => setProgKey(e.target.value)}
          className="rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary"
        >
          {myPrograms.length === 0 && <option value="">배정된 사업 없음</option>}
          {myPrograms.map((p) => (
            <option key={programKey(p)} value={programKey(p)}>
              {p.year} · {p.name ?? p.programCode}
            </option>
          ))}
        </select>
        <select
          value={companyId ?? ""}
          onChange={(e) => setCompanyId(Number(e.target.value))}
          className="min-w-[140px] rounded-md border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary"
        >
          {applicants.length === 0 && <option value="">신청 기업 없음</option>}
          {applicants.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          <input
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="파일 이름"
            className="w-44 rounded-md border bg-background px-2.5 py-1.5 text-[12px] outline-none focus:border-primary"
          />
          <span className="flex items-center bg-muted px-1.5 py-1.5 text-[11px] text-muted-foreground rounded">.pdf</span>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={print}
            disabled={pickedCount === 0}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium",
              pickedCount === 0 ? "text-muted-foreground" : "hover:bg-muted"
            )}
          >
            <Printer className="h-3.5 w-3.5" /> 인쇄
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={downloadPdf}
            disabled={pickedCount === 0}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
              pickedCount === 0 ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground hover:opacity-90"
            )}
          >
            <Download className="h-3.5 w-3.5" /> PDF 다운로드
          </button>
          <button onClick={onClose} aria-label="닫기" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 좌우 분할 */}
      <div className="grid min-h-0 flex-1 grid-cols-2 divide-x">
        {/* 왼쪽: 기업 상세 — 지표별 체크 */}
        <div className="min-h-0 overflow-y-auto p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[12px] font-bold text-muted-foreground">담을 항목 선택 (지표별)</p>
            <div className="flex gap-2 text-[11.5px]">
              <button onClick={() => setAll(true)} className="text-primary hover:underline">전체 선택</button>
              <button onClick={() => setAll(false)} className="text-muted-foreground hover:underline">전체 해제</button>
            </div>
          </div>
          {!company ? (
            <p className="py-10 text-center text-[12.5px] text-muted-foreground">기업을 선택하세요.</p>
          ) : (
            <div className="space-y-3">
              {sections.map((sec, si) => {
                const keys = sec.rows.map((_, ri) => `${si}:${ri}`);
                const allOn = keys.length > 0 && keys.every((k) => checked.has(k));
                const someOn = keys.some((k) => checked.has(k));
                return (
                  <div key={si} className="overflow-hidden rounded-lg border">
                    <label className="flex cursor-pointer items-center gap-2 border-b bg-subtle px-3 py-2">
                      <input
                        type="checkbox"
                        checked={allOn}
                        ref={(el) => { if (el) el.indeterminate = someOn && !allOn; }}
                        onChange={(e) => toggleSection(si, e.target.checked)}
                        className="h-3.5 w-3.5 accent-primary"
                      />
                      <span className="text-[12.5px] font-bold">{sec.heading}</span>
                      <span className="text-[11px] text-muted-foreground">{sec.rows.length}개</span>
                    </label>
                    <div className="divide-y">
                      {sec.rows.map(([label, val], ri) => {
                        const key = `${si}:${ri}`;
                        return (
                          <label key={ri} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-muted/40">
                            <input
                              type="checkbox"
                              checked={checked.has(key)}
                              onChange={() => toggleRow(key)}
                              className="h-3.5 w-3.5 accent-primary"
                            />
                            <span className="w-[40%] shrink-0 text-[12px] text-muted-foreground">{label}</span>
                            <span className="min-w-0 flex-1 truncate text-[12px]">{showVal(val)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 오른쪽: 담긴 항목 미리보기 (= PDF 내용) */}
        <div className="min-h-0 overflow-y-auto bg-muted/20 p-4">
          <p className="mb-2 text-[12px] font-bold text-muted-foreground">담긴 항목 미리보기 · {pickedCount}개 지표</p>
          {pickedCount === 0 ? (
            <p className="py-10 text-center text-[12.5px] text-muted-foreground">
              왼쪽에서 담을 항목을 체크하세요.
            </p>
          ) : (
            <div className="mx-auto max-w-[560px] rounded-lg border bg-card p-5 shadow-card">
              <p className="text-[16px] font-extrabold">{company?.name}</p>
              {company?.industry && <p className="mb-3 text-[12px] text-muted-foreground">{company.industry}</p>}
              <div className="space-y-4">
                {picked.map((sec, i) => (
                  <div key={i}>
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
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

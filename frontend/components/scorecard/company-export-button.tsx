"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import type { Company } from "@/types";
import { companySections } from "@/lib/company-report";
import { toCsv, downloadCsv, printReports } from "@/lib/export";
import { savePdfReports } from "@/lib/pdf";
import { ExportDialog } from "@/components/ui/export-dialog";
import { useToast } from "@/lib/toast";

/** 기업 상세 리포트 내보내기 — 개요·재무·기술·지원이력을 PDF(리포트) 또는 CSV로. */
export function CompanyExportButton({ company, latestYear }: { company: Company; latestYear: number }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium hover:bg-muted"
      >
        <Download className="h-3.5 w-3.5" />
        내보내기
      </button>

      {open && (
        <ExportDialog
          title={`${company.name} 스코어카드 내보내기`}
          description="기업 개요·재무·기술·지원이력 핵심 지표를 저장합니다."
          defaultFileName={() => `${company.name} 스코어카드`}
          onExport={(format, _sel, _direct, fileName) => {
            const doc = { name: company.name, subtitle: company.industry ?? undefined, sections: companySections(company, latestYear) };
            setOpen(false);
            if (format === "csv") {
              const rows = doc.sections.flatMap((sec) => sec.rows.map(([k, v]) => [k, v] as (string | number)[]));
              downloadCsv(fileName, toCsv(["항목", "값"], rows));
              toast(`${fileName}.csv 다운로드 완료`);
            } else if (format === "pdf") {
              savePdfReports(fileName, [doc])
                .then(() => toast(`${fileName}.pdf 다운로드 완료`))
                .catch(() => toast("PDF 생성에 실패했습니다.", "error"));
            } else {
              printReports(`${company.name} 심사 스코어카드`, [doc]);
              toast("인쇄 창을 열었습니다.", "info");
            }
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

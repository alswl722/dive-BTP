"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Download, FileSpreadsheet, FileText, Printer, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MultiCombobox, type MultiComboboxOption } from "@/components/ui/multi-combobox";

export type ExportFormat = "csv" | "pdf" | "print";

const FORMAT_META: Record<ExportFormat, { label: string; Icon: typeof FileText }> = {
  csv: { label: "CSV(엑셀)", Icon: FileSpreadsheet },
  pdf: { label: "PDF 저장", Icon: FileText },
  print: { label: "인쇄", Icon: Printer },
};

/** 형식별 파일 확장자. print는 파일이 없다. */
const EXT: Record<ExportFormat, string> = { csv: ".csv", pdf: ".pdf", print: "" };

export interface ExportFilter {
  key: string;
  label: string;
  /** 첫 옵션이 기본 선택. value "" 는 보통 '전체'. */
  options: { value: string; label: string }[];
}

/** 특정 항목을 드롭다운으로 직접 골라 내보내기. 아무것도 안 고르면 필터 결과 전체. */
export interface ExportDirectSelect {
  label: string;
  placeholder: string;
  options: MultiComboboxOption[];
}

/**
 * 내보내기 옵션 모달 — 형식(CSV/PDF/인쇄)과 필터를 고른 뒤 '내보내기'를 누르면
 * 파일이 생기는 형식(CSV/PDF)은 파일 이름 입력 단계로 넘어간다(확장자는 형식에 맞춰 고정).
 * 인쇄는 파일이 없으므로 이름 단계 없이 바로 진행.
 * 데이터 생성·다운로드는 호출측(onExport)이 담당 — 이 컴포넌트는 선택·파일명만 모은다.
 */
export function ExportDialog({
  title,
  description,
  formats = ["csv", "pdf", "print"],
  filters = [],
  directSelect,
  count,
  defaultFileName,
  onExport,
  onClose,
}: {
  title: string;
  description?: string;
  formats?: ExportFormat[];
  filters?: ExportFilter[];
  directSelect?: ExportDirectSelect;
  /** 현재 선택으로 내보낼 건수(있으면 표시). */
  count?: (selected: Record<string, string>, direct: string[]) => number;
  /** 파일 이름 입력칸의 기본값(확장자 없이). 없으면 '내보내기'. */
  defaultFileName?: (selected: Record<string, string>, direct: string[]) => string;
  /** fileName은 확장자 없는 기본 이름(인쇄는 ""). */
  onExport: (format: ExportFormat, selected: Record<string, string>, direct: string[], fileName: string) => void;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<ExportFormat>(formats[0]);
  const [selected, setSelected] = useState<Record<string, string>>(
    () => Object.fromEntries(filters.map((f) => [f.key, f.options[0]?.value ?? ""]))
  );
  const [direct, setDirect] = useState<string[]>([]);
  const [phase, setPhase] = useState<"options" | "name">("options");
  const [fileName, setFileName] = useState("");

  // Esc — 이름 단계면 옵션으로 돌아가고, 옵션 단계면 모달을 닫는다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (phase === "name") setPhase("options");
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, phase]);

  const n = count?.(selected, direct);
  const baseName = () => defaultFileName?.(selected, direct) ?? "내보내기";

  function goExport() {
    // 인쇄는 파일이 없으니 이름 단계를 건너뛴다.
    if (format === "print") {
      onExport(format, selected, direct, "");
      return;
    }
    setFileName(baseName());
    setPhase("name");
  }

  function confirmName() {
    // 사용자가 확장자를 같이 적어도 중복되지 않게 제거하고, 비면 기본값으로.
    const base = fileName.trim().replace(/\.(csv|pdf)$/i, "") || baseName();
    onExport(format, selected, direct, base);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-6">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl bg-card p-5 shadow-modal">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="text-[13px] font-bold">{title}</p>
            {description && phase === "options" && <p className="mt-0.5 text-[11.5px] text-muted-foreground">{description}</p>}
            {phase === "name" && <p className="mt-0.5 text-[11.5px] text-muted-foreground">저장할 파일 이름을 입력하세요.</p>}
          </div>
          <button onClick={onClose} aria-label="닫기" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {phase === "options" ? (
          <>
            <div className="space-y-3">
              {formats.length > 1 && (
                <Field label="형식">
                  <div className="flex rounded-md border p-0.5">
                    {formats.map((f) => {
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
                </Field>
              )}

              {filters.map((f) => (
                <Field key={f.key} label={f.label}>
                  <select
                    value={selected[f.key]}
                    onChange={(e) => setSelected((s) => ({ ...s, [f.key]: e.target.value }))}
                    className="w-full rounded-md border bg-background px-2.5 py-2 text-[12.5px] outline-none focus:border-primary"
                  >
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}

              {directSelect && (
                <Field label={`${directSelect.label} 직접 선택`}>
                  <MultiCombobox
                    options={directSelect.options}
                    values={direct}
                    onChange={setDirect}
                    placeholder={directSelect.placeholder}
                  />
                  <span className="mt-0.5 block text-[10.5px] text-muted-foreground">
                    {direct.length > 0 ? `${direct.length}개 직접 선택 — 위 필터는 무시됩니다.` : "선택하지 않으면 위 필터 결과 전체를 내보냅니다."}
                  </span>
                </Field>
              )}
            </div>

            <p className="mt-3 text-[11px] text-muted-foreground">
              {format === "pdf"
                ? "PDF 파일이 바로 다운로드됩니다."
                : format === "print"
                ? "인쇄 창이 열립니다. 대화상자에서 프린터 또는 'PDF로 저장'을 선택하세요."
                : "엑셀에서 바로 열 수 있는 CSV로 저장됩니다."}
            </p>

            <div className="mt-4 flex items-center justify-between">
              <span className="text-[11.5px] text-muted-foreground">{n != null ? `${n}건 내보내기` : ""}</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={onClose} className="rounded-md px-3.5 py-2 text-[12.5px] text-muted-foreground hover:bg-muted">
                  취소
                </button>
                <button
                  type="button"
                  onClick={goExport}
                  disabled={n === 0}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[12.5px] font-medium transition-colors",
                    n === 0 ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground hover:opacity-90"
                  )}
                >
                  {format === "print" ? <Printer className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                  {format === "print" ? "인쇄" : "내보내기"}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <Field label="파일 이름">
              <div className="flex items-stretch overflow-hidden rounded-md border focus-within:border-primary">
                <input
                  value={fileName}
                  autoFocus
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setFileName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirmName()}
                  placeholder={baseName()}
                  className="min-w-0 flex-1 bg-background px-3 py-2 text-[12.5px] outline-none"
                />
                <span className="flex items-center bg-muted px-2.5 text-[12px] font-medium text-muted-foreground">{EXT[format]}</span>
              </div>
            </Field>
            <p className="mt-2 text-[11px] text-muted-foreground">
              확장자 <b className="text-foreground">{EXT[format]}</b>는 자동으로 붙습니다. {n != null ? `${n}건` : ""} 저장됩니다.
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
                onClick={confirmName}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

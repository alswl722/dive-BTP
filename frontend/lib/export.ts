// 내보내기 유틸 — CSV(엑셀) · 인쇄(@media print) · 리포트 HTML/CSS 빌더.
// PDF 파일 직접 다운로드는 lib/pdf.ts(jsPDF+html2canvas)가 담당한다.
//
// 환경 독립성: 폰트를 OS 폰트(맑은고딕/애플고딕)에 의존하지 않고, 앱이 자체 번들한
// Noto Sans KR(var(--font-sans))을 그대로 쓴다. 인쇄도 새 창(window.open) 대신 앱 문서
// 안에서 @media print로 처리해, 어떤 OS/브라우저에서도 화면과 같은 폰트로 출력된다.

type Cell = string | number | null | undefined;

const esc = (v: Cell): string => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** 헤더 + 2차원 행 → CSV 문자열. */
export function toCsv(headers: string[], rows: Cell[][]): string {
  return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

/** CSV 문자열 → 파일 다운로드. BOM 붙여 엑셀 한글 깨짐 방지. */
export function downloadCsv(fileName: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".csv") ? fileName : `${fileName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export const escHtml = (v: Cell): string =>
  (v == null ? "" : String(v)).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

export interface ReportSection {
  heading: string;
  rows: [string, Cell][];
}

// 앱 번들 폰트를 최우선으로, OS 폰트는 뒤 fallback으로만. var(--font-sans)는 <html>에
// 항상 세팅돼 있어 어느 환경에서든 동일하게 해석된다(next/font 자체 호스팅).
const FONT = "var(--font-sans),'Malgun Gothic','Apple SD Gothic Neo',sans-serif";

// CSS를 특정 id 하위로 스코프해 전역 누출 없이 인쇄/PDF에 모두 재사용한다.
export function tableCss(s: string): string {
  return `
    ${s} *{box-sizing:border-box;font-family:${FONT};color:#16232b}
    ${s} h1{font-size:18px;margin:0 0 2px} ${s} .sub{font-size:12px;color:#6b8090;margin:0 0 14px}
    ${s} table{width:100%;border-collapse:collapse;font-size:11px}
    ${s} th,${s} td{border:1px solid #d5dee4;padding:5px 7px;text-align:left;vertical-align:top}
    ${s} th{background:#f0f4f7;font-weight:700} ${s} tr:nth-child(even) td{background:#f8fafc}`;
}

export function reportCss(s: string): string {
  return `
    ${s} *{box-sizing:border-box;font-family:${FONT};color:#16232b}
    ${s} article + article{break-before:page}
    ${s} h1{font-size:18px;margin:0 0 2px} ${s} .sub{font-size:12px;color:#6b8090;margin:0 0 14px}
    ${s} section{margin:0 0 13px;break-inside:avoid} ${s} h2{font-size:13px;margin:0 0 6px;padding-bottom:4px;border-bottom:2px solid #017ebe;color:#017ebe}
    ${s} table{width:100%;border-collapse:collapse;font-size:12px}
    ${s} th,${s} td{border:1px solid #e0e6ea;padding:5px 9px;text-align:left} ${s} th{width:38%;background:#f6f9fb;font-weight:600;color:#334}`;
}

/** 표 리포트 innerHTML. */
export function renderTable(title: string, headers: string[], rows: Cell[][], subtitle?: string): string {
  const thead = `<tr>${headers.map((h) => `<th>${escHtml(h)}</th>`).join("")}</tr>`;
  const tbody = rows.map((r) => `<tr>${r.map((c) => `<td>${escHtml(c)}</td>`).join("")}</tr>`).join("");
  return `<h1>${escHtml(title)}</h1>${subtitle ? `<p class="sub">${escHtml(subtitle)}</p>` : ""}
    <table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

/** 기업 1건 리포트 innerHTML(<article>). */
export function renderReport(name: string, sections: ReportSection[], subtitle?: string): string {
  const body = sections
    .map(
      (sec) => `<section><h2>${escHtml(sec.heading)}</h2><table>${sec.rows
        .map(([k, v]) => `<tr><th>${escHtml(k)}</th><td>${escHtml(v)}</td></tr>`)
        .join("")}</table></section>`
    )
    .join("");
  return `<article><h1>${escHtml(name)}</h1>${subtitle ? `<p class="sub">${escHtml(subtitle)}</p>` : ""}${body}</article>`;
}

/** 여러 기업 리포트 innerHTML(기업 1개당 <article>, page-break). */
export function renderReports(docs: { name: string; subtitle?: string; sections: ReportSection[] }[]): string {
  return docs.map((d) => renderReport(d.name, d.sections, d.subtitle)).join("");
}

const PRINT_ID = "btp-print-root";

// 앱 문서 안에 인쇄 전용 루트를 만들고, @media print에서 앱 본문을 숨긴 뒤 이 루트만 보여
// window.print()를 호출한다. 새 창을 열지 않으므로 팝업 차단·폰트 미상속 문제가 없다.
function runPrint(inner: string, scopedCss: string, landscape: boolean) {
  document.getElementById(PRINT_ID)?.remove();
  document.querySelectorAll("style[data-btp-print]").forEach((n) => n.remove());

  const root = document.createElement("div");
  root.id = PRINT_ID;
  root.innerHTML = inner;

  const style = document.createElement("style");
  style.setAttribute("data-btp-print", "");
  style.textContent = `
    #${PRINT_ID}{display:none}
    @media print{
      body > *:not(#${PRINT_ID}){display:none!important}
      #${PRINT_ID}{display:block!important}
      @page{margin:${landscape ? "12mm" : "16mm"};size:A4 ${landscape ? "landscape" : "portrait"}}
      ${scopedCss}
    }`;

  document.head.appendChild(style);
  document.body.appendChild(root);

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    root.remove();
    style.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  // afterprint가 안 오는 브라우저 대비 — 넉넉히 뒤에 정리
  window.setTimeout(cleanup, 60000);

  window.print();
}

/** 표를 인쇄(가로). */
export function printTable(title: string, headers: string[], rows: Cell[][], subtitle?: string) {
  runPrint(renderTable(title, headers, rows, subtitle), tableCss(`#${PRINT_ID}`), true);
}

/** 기업 리포트(들)를 인쇄(세로, 기업 1개당 1페이지). */
export function printReports(_title: string, docs: { name: string; subtitle?: string; sections: ReportSection[] }[]) {
  runPrint(renderReports(docs), reportCss(`#${PRINT_ID}`), false);
}

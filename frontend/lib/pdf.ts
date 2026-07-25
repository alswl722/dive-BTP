// PDF 직접 다운로드 — 화면 밖에 리포트를 렌더한 뒤 html2canvas로 캡처, jsPDF로 페이지 조립.
// window.print() 대화상자 없이 .pdf 파일이 바로 받아진다(인쇄와 별도 버튼).
//
// 환경 독립성: 앱 문서 안(화면 밖)에서 렌더하므로 앱이 자체 번들한 Noto Sans KR
// (var(--font-sans))을 그대로 쓴다. 캡처 전 document.fonts.ready로 폰트 로드를 보장해,
// OS에 한글 폰트가 없어도 두부(□) 깨짐이 없다. jsPDF/html2canvas는 번들되어 오프라인·
// 어느 환경에서든 동일하게 동작한다. 스타일은 host id로 스코프해 전역 누출이 없다.

import { renderTable, renderReports, tableCss, reportCss, escHtml, type ReportSection } from "@/lib/export";
import type { ReportItem } from "@/lib/report-blocks";

const HOST_ID = "btp-pdf-host";

async function renderPagesToPdf(
  fileName: string,
  pagesHtml: string[],
  scopedCss: string,
  widthPx: number,
  orientation: "p" | "l",
  // true면 한 페이지보다 긴 내용을 잘라 나누지 않고, 페이지 높이에 맞춰 축소해 1장에 담는다
  // (기업 리포트 = 기업당 정확히 1페이지). false면 긴 표를 세로로 잘라 여러 페이지로.
  fitOnePage = false
) {
  const { jsPDF } = await import("jspdf");
  const html2canvas = (await import("html2canvas")).default;

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${widthPx}px`;
  host.innerHTML =
    `<style>${scopedCss}</style>` +
    pagesHtml.map((p) => `<div class="pdf-page" style="background:#fff;padding:28px">${p}</div>`).join("");
  document.body.appendChild(host);

  // 번들 폰트가 로드된 뒤에 캡처해야 한글이 정상 렌더된다.
  if (document.fonts?.ready) await document.fonts.ready;

  try {
    const pdf = new jsPDF({ unit: "pt", format: "a4", orientation });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const pages = Array.from(host.querySelectorAll<HTMLElement>(".pdf-page"));
    let first = true;

    for (const el of pages) {
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff" });
      const ratio = pw / canvas.width;
      const fullH = canvas.height * ratio;
      if (fullH <= ph) {
        if (!first) pdf.addPage();
        first = false;
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pw, fullH);
      } else if (fitOnePage) {
        // 페이지에 맞춰 축소(가로 중앙 정렬) — 잘리지 않고 1페이지로.
        const imgW = pw * (ph / fullH);
        if (!first) pdf.addPage();
        first = false;
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", (pw - imgW) / 2, 0, imgW, ph);
      } else {
        // 한 페이지보다 길면(긴 표) 세로로 잘라 여러 페이지에 나눠 담는다
        const pxPerPage = Math.floor((canvas.width * ph) / pw);
        for (let y = 0; y < canvas.height; y += pxPerPage) {
          const h = Math.min(pxPerPage, canvas.height - y);
          const slice = document.createElement("canvas");
          slice.width = canvas.width;
          slice.height = h;
          slice.getContext("2d")!.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
          if (!first) pdf.addPage();
          first = false;
          pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pw, h * ratio);
        }
      }
    }
    pdf.save(fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`);
  } finally {
    host.remove();
  }
}

type Cell = string | number | null | undefined;

/** 표를 PDF로 저장(가로). 긴 표는 여러 페이지로 나뉜다. */
export async function savePdfTable(fileName: string, title: string, headers: string[], rows: Cell[][], subtitle?: string) {
  await renderPagesToPdf(fileName, [renderTable(title, headers, rows, subtitle)], tableCss(`#${HOST_ID}`), 1040, "l");
}

/** 기업 리포트(들)를 PDF로 저장 — 기업 1개당 1페이지(세로). */
export async function savePdfReports(fileName: string, docs: { name: string; subtitle?: string; sections: ReportSection[] }[]) {
  const pages = docs.map((d) => renderReports([d]));
  await renderPagesToPdf(fileName, pages, reportCss(`#${HOST_ID}`), 760, "p", true);
}

/**
 * 리포트 편집 빌더 — 데이터 섹션(네이티브 표)과 차트 이미지를 섞어 깔끔한 PDF로 저장.
 * 표는 HTML로 렌더돼 선명하고(캡처 아님), 차트만 이미지로 들어간다. 한글은 번들 폰트로 렌더.
 */
export async function savePdfReport(fileName: string, name: string, subtitle: string | undefined, items: ReportItem[]) {
  const body = items
    .map((it) =>
      it.type === "section"
        ? `<section><h2>${escHtml(it.section.heading)}</h2><table>${it.section.rows
            .map(([k, v]) => `<tr><th>${escHtml(k)}</th><td>${escHtml(v)}</td></tr>`)
            .join("")}</table></section>`
        : `<section><h2>${escHtml(it.label)}</h2><img src="${it.dataUrl}" style="max-width:100%;border:1px solid #e0e6ea;border-radius:6px"/></section>`
    )
    .join("");
  const inner = `<article><h1>${escHtml(name)}</h1>${subtitle ? `<p class="sub">${escHtml(subtitle)}</p>` : ""}${body}</article>`;
  await renderPagesToPdf(fileName, [inner], reportCss(`#${HOST_ID}`), 760, "p", true);
}

/**
 * 이미지(캡처) 블록들을 세로로 쌓아 PDF로 저장 — 리포트 편집 빌더용.
 * 각 이미지는 페이지 폭에 맞춰 축소, 페이지가 넘치면 다음 페이지로. 제목은 첫 페이지 상단.
 */
export async function savePdfImages(
  fileName: string,
  title: string,
  images: { dataUrl: string; w: number; h: number }[],
  subtitle?: string
) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "p" });
  const M = 32; // 여백(pt)
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const contentW = pw - M * 2;

  let y = M;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  // 한글은 jsPDF 기본폰트 미지원 → 제목도 이미지로? 여기선 파일명이 한글이라 제목은 생략 가능.
  // 안전하게 제목 텍스트는 넣지 않고(폰트 이슈), 이미지들만 배치한다.
  void title; void subtitle;

  for (const img of images) {
    const drawW = contentW;
    const drawH = (img.h / img.w) * drawW;
    // 한 페이지보다 크면 페이지 폭 기준으로 축소되도록 높이 상한 적용
    const maxH = ph - M * 2;
    const finalH = Math.min(drawH, maxH);
    const finalW = finalH < drawH ? (img.w / img.h) * finalH : drawW;
    if (y + finalH > ph - M && y > M) {
      pdf.addPage();
      y = M;
    }
    const x = M + (contentW - finalW) / 2;
    pdf.addImage(img.dataUrl, "PNG", x, y, finalW, finalH);
    y += finalH + 16;
  }

  pdf.save(fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`);
}

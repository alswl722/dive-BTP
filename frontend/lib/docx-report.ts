"use client";

// 리포트 편집 빌더 — 선택 항목을 편집 가능한 Word(.docx)로 저장.
// 데이터 섹션은 네이티브 표, 차트는 이미지로 삽입. 한글은 Word 기본 폰트로 정상 렌더.

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, ImageRun, BorderStyle,
} from "docx";
import type { ReportItem } from "@/lib/report-blocks";

function b64ToUint8(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(",")[1] ?? "";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

const B = { style: BorderStyle.SINGLE, size: 4, color: "E0E6EA" } as const;

function cell(text: string, head: boolean): TableCell {
  return new TableCell({
    width: { size: head ? 35 : 65, type: WidthType.PERCENTAGE },
    shading: head ? { fill: "F6F9FB", color: "auto", type: "clear" } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text, bold: head, color: head ? "334455" : "16232B", size: 20 })] })],
  });
}

export async function saveDocx(fileName: string, name: string, subtitle: string | undefined, items: ReportItem[]) {
  const children: (Paragraph | Table)[] = [new Paragraph({ text: name, heading: HeadingLevel.HEADING_1 })];
  if (subtitle) children.push(new Paragraph({ children: [new TextRun({ text: subtitle, color: "6B8090", size: 20 })] }));

  for (const it of items) {
    if (it.type === "section") {
      children.push(new Paragraph({ text: it.section.heading, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 } }));
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: { top: B, bottom: B, left: B, right: B, insideHorizontal: B, insideVertical: B },
          rows: it.section.rows.map(([k, v]) => new TableRow({ children: [cell(String(k), true), cell(v == null || v === "" ? "-" : String(v), false)] })),
        })
      );
    } else {
      children.push(new Paragraph({ text: it.label, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 } }));
      const w = Math.min(520, it.w / 2);
      const h = w * (it.h / it.w);
      children.push(new Paragraph({ children: [new ImageRun({ type: "png", data: b64ToUint8(it.dataUrl), transformation: { width: Math.round(w), height: Math.round(h) } })] }));
    }
  }

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".docx") ? fileName : `${fileName}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

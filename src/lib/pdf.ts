import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export async function extractPdfText(file: File) {
  const data = await file.arrayBuffer();
  const document = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(reconstructPdfTextFromItems(content.items));
  }

  return pages.join("\n");
}

type PositionedTextItem = {
  str: string;
  transform: number[];
  width?: number;
};

export function reconstructPdfTextFromItems(items: unknown[]) {
  const positionedItems = items
    .filter(isPositionedTextItem)
    .map((item) => ({
      text: item.str.trim(),
      x: item.transform[4] ?? 0,
      y: item.transform[5] ?? 0,
      width: item.width ?? estimateTextWidth(item.str),
    }))
    .filter((item) => item.text.length > 0);

  if (positionedItems.length === 0) return "";

  const rows: Array<{ y: number; items: typeof positionedItems }> = [];
  for (const item of positionedItems.sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 2.5);
    if (row) {
      row.items.push(item);
      row.y = (row.y + item.y) / 2;
    } else {
      rows.push({ y: item.y, items: [item] });
    }
  }

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => joinPdfRow(row.items.sort((a, b) => a.x - b.x)))
    .filter(Boolean)
    .join("\n");
}

function isPositionedTextItem(item: unknown): item is PositionedTextItem {
  return Boolean(
    item
      && typeof item === "object"
      && "str" in item
      && typeof item.str === "string"
      && "transform" in item
      && Array.isArray(item.transform),
  );
}

function joinPdfRow(items: Array<{ text: string; x: number; width: number }>) {
  let line = "";
  let previousEnd = 0;

  for (const item of items) {
    const gap = item.x - previousEnd;
    if (!line) {
      line = item.text;
    } else if (gap > 18) {
      line += "   " + item.text;
    } else if (gap > 2 && shouldSeparatePdfText(line, item.text)) {
      line += " " + item.text;
    } else {
      line += item.text;
    }
    previousEnd = Math.max(previousEnd, item.x + item.width);
  }

  return line.replace(/\s+/g, " ").trim();
}

function shouldSeparatePdfText(currentLine: string, nextText: string) {
  const last = currentLine.at(-1) ?? "";
  const first = nextText.at(0) ?? "";
  if (!last || !first) return false;
  if (/\d/.test(last) && /[,./-]/.test(first)) return false;
  if (/[,./-]/.test(last) && /\d/.test(first)) return false;
  return true;
}

function estimateTextWidth(text: string) {
  return Math.max(text.length * 5, 1);
}

/**
 * High-accuracy browser-only document text extraction (PDF, DOCX, scanned OCR, images, text) + ZIP unpacking.
 *
 * Includes:
 * 1. Spatial 2D layout reconstruction (Y-descending, X-ascending with word-gap heuristics).
 * 2. Multi-column resume layout detection & natural reading order.
 * 3. Automatic Canvas + Tesseract OCR fallback for scanned/image-only PDFs.
 * 4. Reusable singleton worker pool for fast batch processing without performance lag.
 */

export type ExtractedFile = {
  name: string;
  bytes: Uint8Array;
  kind: "pdf" | "docx" | "image" | "text" | "unsupported";
};

const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff", "gif"];
const TEXT_EXT = ["txt", "md", "rtf", "csv"];

export function classify(name: string): ExtractedFile["kind"] {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (ext === "docx" || ext === "doc") return "docx";
  if (IMAGE_EXT.includes(ext)) return "image";
  if (TEXT_EXT.includes(ext)) return "text";
  return "unsupported";
}

function isJunk(path: string) {
  const base = path.split("/").pop() ?? path;
  return path.startsWith("__MACOSX") || base.startsWith(".") || base === "";
}

/** Expands uploaded files: zips are unpacked, everything else passes through. */
export async function collectFiles(files: File[]): Promise<ExtractedFile[]> {
  const { unzipSync } = await import("fflate");
  const out: ExtractedFile[] = [];

  for (const file of files) {
    const isZip = file.name.toLowerCase().endsWith(".zip");
    const buf = new Uint8Array(await file.arrayBuffer());

    if (isZip) {
      const entries = unzipSync(buf);
      for (const [path, bytes] of Object.entries(entries)) {
        if (isJunk(path) || bytes.length === 0) continue;
        out.push({ name: path, bytes, kind: classify(path) });
      }
    } else {
      out.push({ name: file.name, bytes: buf, kind: classify(file.name) });
    }
  }

  return out.filter((f) => f.kind !== "unsupported");
}

/* ----------------------------- Worker Singletons ----------------------------- */

let pdfjsInitPromise: Promise<typeof import("pdfjs-dist")> | null = null;
async function getPdfJs() {
  if (!pdfjsInitPromise) {
    pdfjsInitPromise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    })();
  }
  return pdfjsInitPromise;
}

// Reusable Tesseract worker singleton
type TesseractWorker = Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>>;
let ocrWorkerPromise: Promise<TesseractWorker> | null = null;
async function getOcrWorker(): Promise<TesseractWorker> {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker("eng", 1);
    })();
  }
  return ocrWorkerPromise;
}

/* ----------------------------- PDF Extraction ----------------------------- */

type PdfTextItem = {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

/**
 * Groups spatial text items into clean, readable lines, handling column layouts and word spacing.
 */
function reconstructPageText(items: PdfTextItem[], pageWidth: number): string {
  if (!items.length) return "";

  // Check if page exhibits a clear 2-column layout
  // (Left column items strictly < splitX, Right column items strictly > splitX)
  const midX = pageWidth / 2;
  const leftColItems = items.filter((it) => it.x + it.w < midX + 15);
  const rightColItems = items.filter((it) => it.x >= midX - 15);

  const isTwoColumn =
    items.length > 20 &&
    leftColItems.length > items.length * 0.25 &&
    rightColItems.length > items.length * 0.25 &&
    leftColItems.length + rightColItems.length >= items.length * 0.85;

  if (isTwoColumn) {
    const leftText = reconstructSingleBlockText(leftColItems);
    const rightText = reconstructSingleBlockText(rightColItems);
    return `${leftText}\n\n${rightText}`.trim();
  }

  return reconstructSingleBlockText(items);
}

function reconstructSingleBlockText(items: PdfTextItem[]): string {
  if (!items.length) return "";

  // Sort items: top to bottom (Y descending in PDF), then left to right (X ascending)
  const sorted = [...items].sort((a, b) => {
    const dy = Math.abs(a.y - b.y);
    if (dy <= 3.5) {
      return a.x - b.x;
    }
    return b.y - a.y; // Higher Y coordinate is higher on the page in PDF
  });

  const lines: string[] = [];
  let currentLineItems: PdfTextItem[] = [];
  let currentY: number | null = null;

  for (const item of sorted) {
    if (currentY === null) {
      currentY = item.y;
      currentLineItems.push(item);
    } else if (Math.abs(item.y - currentY) <= 3.5) {
      currentLineItems.push(item);
    } else {
      // Flush previous line
      lines.push(assembleLine(currentLineItems));
      currentLineItems = [item];
      currentY = item.y;
    }
  }

  if (currentLineItems.length > 0) {
    lines.push(assembleLine(currentLineItems));
  }

  return lines.filter(Boolean).join("\n");
}

function assembleLine(items: PdfTextItem[]): string {
  items.sort((a, b) => a.x - b.x);
  let line = "";
  let lastRight = 0;

  for (const it of items) {
    const text = it.str;
    if (!text) continue;

    if (!line) {
      line = text;
    } else {
      const gap = it.x - lastRight;
      // If gap exists between text chunks and no trailing/leading space, insert space
      if (gap > 2.5 && !line.endsWith(" ") && !text.startsWith(" ")) {
        line += " " + text;
      } else {
        line += text;
      }
    }
    lastRight = it.x + Math.max(it.w, text.length * 4);
  }

  return line.trim();
}

/**
 * Renders a PDF page to Canvas and runs Tesseract OCR as a seamless fallback for scanned resumes.
 */
async function ocrPdfPage(page: any, onProgress?: (pct: number) => void): Promise<string> {
  const viewport = page.getViewport({ scale: 2.0 }); // 2.0 scale for sharp OCR
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  await page.render({ canvasContext: ctx, viewport }).promise;

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return "";

  const worker = await getOcrWorker();
  const { data } = await worker.recognize(blob);
  return (data.text ?? "").trim();
}

async function extractPdf(bytes: Uint8Array, onProgress?: (pct: number) => void): Promise<string> {
  const pdfjs = await getPdfJs();
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  let text = "";
  let hasImage = false;
  let totalChars = 0;

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1.0 });
    const content = await page.getTextContent();

    try {
      const ops = await page.getOperatorList();
      if (ops && ops.fnArray) {
        const imgOps = new Set([
          pdfjs.OPS?.paintImageXObject ?? 82,
          pdfjs.OPS?.paintInlineImageXObject ?? 83,
          pdfjs.OPS?.paintImageMaskXObject ?? 84,
        ]);
        if (ops.fnArray.some((fn) => imgOps.has(fn))) {
          hasImage = true;
        }
      }
    } catch {
      // Non-fatal
    }

    const items: PdfTextItem[] = [];
    for (const item of content.items) {
      if ("str" in item && typeof item.str === "string") {
        const tx = "transform" in item && Array.isArray(item.transform) ? item.transform[4] : 0;
        const ty = "transform" in item && Array.isArray(item.transform) ? item.transform[5] : 0;
        items.push({
          str: item.str,
          x: tx,
          y: ty,
          w: item.width || item.str.length * 6,
          h: item.height || 10,
        });
      }
    }

    let pageText = reconstructPageText(items, viewport.width);

    // If page has almost no selectable text (scanned PDF page), run OCR fallback
    if (pageText.replace(/\s/g, "").length < 30 && typeof document !== "undefined") {
      try {
        const ocrText = await ocrPdfPage(page, onProgress);
        if (ocrText.length > pageText.length) {
          pageText = ocrText;
          hasImage = true;
        }
      } catch (err) {
        console.warn("[extractPdf] Scanned page OCR fallback skipped:", err);
      }
    }

    totalChars += pageText.replace(/\s/g, "").length;
    text += `--- Page ${i} ---\n` + pageText + "\n\n";
  }

  await doc.cleanup();

  // If entire document has negligible text, attempt full document OCR
  if (totalChars < 40 && typeof document !== "undefined") {
    let fullOcrText = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const pageOcr = await ocrPdfPage(page, onProgress);
      fullOcrText += `--- Page ${i} ---\n` + pageOcr + "\n\n";
    }
    if (fullOcrText.replace(/\s/g, "").length >= 40) {
      text = fullOcrText;
      hasImage = true;
    }
  }

  const metaHeader = `[DOCUMENT METRICS: ${doc.numPages} Page(s) | Embedded Image/Photo: ${hasImage ? "Detected" : "None"}]\n\n`;
  return (metaHeader + text).trim();
}

/* ----------------------------- DOCX Extraction ----------------------------- */

async function extractDocx(bytes: Uint8Array, name: string): Promise<string> {
  if (name.toLowerCase().endsWith(".doc")) {
    throw new Error(
      "Legacy Word (.doc) format is not supported. Please re-save or convert your resume to .docx or .pdf.",
    );
  }
  // @ts-expect-error - browser bundle has no bundled types
  const mammoth = await import("mammoth/mammoth.browser.min.js");
  const lib = mammoth.default ?? mammoth;
  try {
    const result = await lib.extractRawText({ arrayBuffer: bytes.slice().buffer });
    const text = String(result.value ?? "").trim();
    if (!text) {
      throw new Error("Could not extract readable text from this .docx file. Ensure it is not empty or password protected.");
    }
    return text;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Legacy Word")) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("end of central directory") || msg.includes("Can't find end of central directory")) {
      throw new Error("The Word document is corrupted or is a legacy .doc file renamed to .docx. Please convert to standard .docx or .pdf.");
    }
    throw err;
  }
}

/* ----------------------------- Image Extraction (OCR) ----------------------------- */

async function extractImage(
  bytes: Uint8Array,
  name: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const worker = await getOcrWorker();
  const blob = new Blob([bytes.slice() as unknown as BlobPart], { type: mimeFor(name) });
  const { data } = await worker.recognize(blob);
  return (data.text ?? "").trim();
}

function mimeFor(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "bmp") return "image/bmp";
  if (ext === "gif") return "image/gif";
  if (ext === "tif" || ext === "tiff") return "image/tiff";
  return "image/jpeg";
}

/* ----------------------------- Unified Entry ----------------------------- */

export async function extractText(
  file: ExtractedFile,
  onProgress?: (pct: number) => void,
): Promise<string> {
  switch (file.kind) {
    case "pdf": {
      const text = await extractPdf(file.bytes, onProgress);
      if (text.replace(/\s/g, "").length > 40) return text;
      throw new Error(
        "Could not extract readable text from this PDF. Please check if the file is corrupted or password-protected.",
      );
    }
    case "docx":
      return extractDocx(file.bytes, file.name);
    case "image":
      return extractImage(file.bytes, file.name, onProgress);
    case "text":
      return new TextDecoder().decode(file.bytes).trim();
    default:
      throw new Error("Unsupported file type");
  }
}

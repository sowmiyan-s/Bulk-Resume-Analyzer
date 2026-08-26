/** Browser-only document text extraction (PDF, DOCX/DOC, images, text) + ZIP unpacking. */

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

async function extractPdf(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  let text = "";
  let hasImage = false;

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
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
      // Non-fatal if operator list check fails
    }

    const pageLines: string[] = [];
    let lastY: number | null = null;
    let currentLine = "";

    for (const item of content.items) {
      if ("str" in item) {
        const itemY = "transform" in item ? Math.round(item.transform[5]) : null;
        if (lastY !== null && itemY !== null && Math.abs(itemY - lastY) > 6) {
          if (currentLine.trim()) pageLines.push(currentLine.trim());
          currentLine = item.str;
        } else {
          currentLine += (currentLine ? " " : "") + item.str;
        }
        lastY = itemY;
      }
    }
    if (currentLine.trim()) pageLines.push(currentLine.trim());

    text += `--- Page ${i} ---\n` + pageLines.join("\n") + "\n\n";
  }

  await doc.cleanup();

  const metaHeader = `[DOCUMENT METRICS: ${doc.numPages} Page(s) | Embedded Image/Photo: ${hasImage ? "Detected" : "None"}]\n\n`;
  return (metaHeader + text).trim();
}

async function extractDocx(bytes: Uint8Array, name: string): Promise<string> {
  if (name.toLowerCase().endsWith(".doc")) {
    throw new Error(
      "Legacy Word (.doc) format is not supported in the browser. Please re-save or convert your resume to .docx or .pdf.",
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

async function extractImage(
  bytes: Uint8Array,
  name: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") onProgress?.(Math.round(m.progress * 100));
    },
  });
  try {
    const blob = new Blob([bytes.slice() as unknown as BlobPart], { type: mimeFor(name) });
    const { data } = await worker.recognize(blob);
    return (data.text ?? "").trim();
  } finally {
    await worker.terminate();
  }
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

export async function extractText(
  file: ExtractedFile,
  onProgress?: (pct: number) => void,
): Promise<string> {
  switch (file.kind) {
    case "pdf": {
      const text = await extractPdf(file.bytes);
      if (text.replace(/\s/g, "").length > 40) return text;
      // Scanned PDF with no embedded text layer.
      throw new Error(
        "This PDF has no selectable text (likely a scan). Export it as an image or a text-based PDF.",
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

import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function extractPdfText(file: File): Promise<string> {
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const document = await task.promise;
  try {
    const pages: string[] = [];
    for (let i = 1; i <= Math.min(document.numPages, 30); i++) {
      const page = await document.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map(item => "str" in item ? item.str : "").join(" ");
      pages.push(`第 ${i} 页：${text}`);
    }
    return pages.join("\n").slice(0, 20000);
  } finally { await task.destroy(); }
}

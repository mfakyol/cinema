export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before freeing the data.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG export failed"))), "image/png"),
  );
}

/**
 * One ticket picture per page, each page sized to its picture; jsPDF is loaded only when
 * someone asks for a PDF. Pages are JPEG, which keeps the file small and the QR sharp.
 */
export async function canvasesToPdf(canvases: HTMLCanvasElement[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const width = 300;
  const pageSize = (canvas: HTMLCanvasElement): [number, number] => [width, (width * canvas.height) / canvas.width];
  const pdf = new jsPDF({ unit: "pt", format: pageSize(canvases[0]!) });
  canvases.forEach((canvas, index) => {
    const [w, h] = pageSize(canvas);
    if (index > 0) pdf.addPage([w, h]);
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, w, h);
  });
  return pdf.output("blob");
}

/** A file-name-safe version of a title: "Beyond the Stars" → "beyond-the-stars". */
export function slug(text: string): string {
  return (
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "tickets"
  );
}

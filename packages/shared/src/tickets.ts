/**
 * Every QR code holds a link to its own page, so any phone camera opens it. The path says
 * what it is: /t/<code> for a ticket, /c/<code> for a concession item (snack, drink, 3D
 * glasses). Scanners read the same link and take the kind and the code out of it.
 */
export type QrKind = "ticket" | "concession";

const PATHS: Record<QrKind, string> = { ticket: "t", concession: "c" };

function qrUrl(siteUrl: string, kind: QrKind, qrToken: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/${PATHS[kind]}/${encodeURIComponent(qrToken)}`;
}

export const ticketUrl = (siteUrl: string, qrToken: string) => qrUrl(siteUrl, "ticket", qrToken);

export const concessionUrl = (siteUrl: string, qrToken: string) => qrUrl(siteUrl, "concession", qrToken);

export interface ScannedCode {
  /** Null for a bare code, whose kind only the endpoint it is sent to can tell. */
  kind: QrKind | null;
  qrToken: string;
}

/** What a scanner read: a ticket or concession link, or a bare code. */
export function parseScan(scanned: string): ScannedCode {
  const text = scanned.trim();
  try {
    const match = new URL(text).pathname.match(/\/(t|c)\/([^/]+)\/?$/);
    if (match?.[1] && match[2]) {
      return { kind: match[1] === "t" ? "ticket" : "concession", qrToken: decodeURIComponent(match[2]) };
    }
  } catch {
    // Not a URL: a bare code.
  }
  return { kind: null, qrToken: text };
}

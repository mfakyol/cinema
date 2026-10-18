/**
 * A ticket's QR code holds a link to its page, so any phone camera opens the ticket.
 * Gate scanners read the same link and take the ticket code out of it.
 */
export function ticketUrl(siteUrl: string, qrToken: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/t/${encodeURIComponent(qrToken)}`;
}

/** The ticket code inside whatever a scanner read: a ticket link, or a bare code. */
export function qrTokenFromScan(scanned: string): string {
  const text = scanned.trim();
  try {
    const match = new URL(text).pathname.match(/\/t\/([^/]+)\/?$/);
    if (match?.[1]) return decodeURIComponent(match[1]);
  } catch {
    // Not a URL: treat it as a bare code.
  }
  return text;
}

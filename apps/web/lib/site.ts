import { ticketUrl } from "@sinema/shared";

/**
 * The website's public address, which ticket links in QR codes point to. It must match the
 * API's WEB_URL so on-screen and emailed codes are the same; the current origin is the default.
 */
export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
}

/** What a ticket's QR code holds: a link to the ticket's own page. */
export const ticketQrValue = (qrToken: string) => ticketUrl(siteUrl(), qrToken);

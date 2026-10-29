import { createRequire } from "node:module";
import { CINEMA_TIME_ZONE, CURRENCY, type Locale } from "@sinema/shared";
import { prisma } from "../db.js";
import type { TicketEmail } from "./mailer.js";
import { orderLink } from "./ticket-email.js";

type Messages = {
  email: Record<"refundSubject" | "refundGreeting" | "refundDetails" | "refundReason" | "showTickets" | "refundLinkHint", string>;
};

const require = createRequire(import.meta.url);
const messages: Record<Locale, Messages> = {
  en: require("@sinema/shared/messages/en.json"),
  tr: require("@sinema/shared/messages/tr.json"),
};

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/**
 * Tells the buyer their order was refunded and why, in their language, through the same email
 * template as the tickets (no QR codes this time; the link shows the cancelled tickets).
 */
export async function buildRefundEmail(orderId: string): Promise<TicketEmail | null> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { showtime: { include: { movie: true, hall: true } } },
  });
  if (!order.contactEmail) return null;
  const locale = (order.locale === "tr" ? "tr" : "en") as Locale;
  const t = messages[locale].email;
  const { showtime } = order;
  const when = new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short", timeZone: CINEMA_TIME_ZONE }).format(
    showtime.startsAt,
  );
  const amount = new Intl.NumberFormat(locale, { style: "currency", currency: CURRENCY }).format(order.amount / 100);

  return {
    to: order.contactEmail,
    subject: fill(t.refundSubject, { movie: showtime.movie.title }),
    params: {
      greeting: t.refundGreeting,
      details: fill(t.refundDetails, { movie: showtime.movie.title, showtime: when, hall: showtime.hall.name, amount }),
      tickets_html: `<p>${escapeHtml(fill(t.refundReason, { reason: order.refundReason ?? "" }))}</p>`,
      order_link: orderLink(order.accessToken),
      show_tickets: t.showTickets,
      link_hint: t.refundLinkHint,
    },
  };
}

import { createRequire } from "node:module";
import { CINEMA_TIME_ZONE, type Locale } from "@sinema/shared";
import { prisma } from "../db.js";
import { env } from "../env.js";
import type { TicketEmail } from "./mailer.js";

type Messages = {
  email: Record<"subject" | "greeting" | "details" | "showTickets" | "linkHint", string>;
  seats: { seatLabel: string };
};

// The same translations the website uses, so emails read like the rest of the product.
const require = createRequire(import.meta.url);
const messages: Record<Locale, Messages> = {
  en: require("@sinema/shared/messages/en.json"),
  tr: require("@sinema/shared/messages/tr.json"),
};

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

export const orderLink = (accessToken: string) => `${env.WEB_URL}/orders/${accessToken}`;

export const qrImageUrl = (qrToken: string) =>
  `${env.API_URL}/api/tickets/${encodeURIComponent(qrToken)}/qr.png`;

/** Builds the confirmation email for a paid order, in the buyer's language. */
export async function buildTicketEmail(orderId: string, locale: Locale): Promise<TicketEmail> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      tickets: {
        include: {
          seat: true,
          showtime: { include: { movie: true, hall: true } },
        },
        orderBy: [{ seat: { row: "asc" } }, { seat: { number: "asc" } }],
      },
    },
  });
  const t = messages[locale];
  const { showtime } = order.tickets[0]!;
  const startsAt = new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: CINEMA_TIME_ZONE,
  }).format(showtime.startsAt);

  const ticketsHtml = order.tickets
    .map((ticket) => {
      const seat = fill(t.seats.seatLabel, { row: ticket.seat.row, number: ticket.seat.number });
      return `<p><strong>${escapeHtml(seat)}</strong><br><img src="${qrImageUrl(ticket.qrToken)}" alt="${escapeHtml(seat)}" width="180" height="180"></p>`;
    })
    .join("");

  return {
    to: order.contactEmail,
    subject: fill(t.email.subject, { movie: showtime.movie.title }),
    params: {
      greeting: t.email.greeting,
      details: fill(t.email.details, {
        movie: showtime.movie.title,
        showtime: startsAt,
        hall: showtime.hall.name,
      }),
      tickets_html: ticketsHtml,
      order_link: orderLink(order.accessToken),
      show_tickets: t.email.showTickets,
      link_hint: t.email.linkHint,
    },
  };
}

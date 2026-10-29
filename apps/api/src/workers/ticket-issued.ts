import type { Locale } from "@sinema/shared";
import { CINEMA_TIME_ZONE } from "@sinema/shared";
import type { Handler } from "../messaging/consumer.js";
import type { TicketIssuedPayload } from "../messaging/events.js";
import { mailer } from "../notifications/index.js";
import { buildTicketEmail } from "../notifications/ticket-email.js";

/**
 * Sends the tickets by email. The send happens inside the processing transaction, so a failed
 * send leaves no processed_messages row and the message is retried. If the send succeeds but the
 * commit then fails, the email goes out twice: email is at least once, which beats never.
 */
export const sendTicketEmail: Handler<TicketIssuedPayload> = async ({ orderId }, tx) => {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { contactEmail: true, locale: true } });
  if (!order.contactEmail) return;
  await mailer.send(await buildTicketEmail(orderId, order.locale as Locale));
};

/** Queues box-office tickets for the counter's printer; other channels have nothing to print. */
export const queueKioskPrint: Handler<TicketIssuedPayload> = async ({ orderId }, tx) => {
  const tickets = await tx.ticket.findMany({ where: { orderId, channel: "KIOSK" }, select: { id: true } });
  if (tickets.length === 0) return;
  await tx.printJob.createMany({ data: tickets.map(({ id }) => ({ ticketId: id })), skipDuplicates: true });
};

/** Adds the order to its cinema day and channel in daily_sales, in one upsert. */
export const recordSale: Handler<TicketIssuedPayload> = async ({ orderId }, tx) => {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      amount: true,
      channel: true,
      createdAt: true,
      _count: { select: { tickets: true } },
      items: { select: { quantity: true } },
    },
  });
  const items = order.items.reduce((sum, item) => sum + item.quantity, 0);
  await tx.$executeRaw`
    INSERT INTO daily_sales (day, channel, orders, tickets, items, revenue)
    VALUES ((${order.createdAt}::timestamptz AT TIME ZONE ${CINEMA_TIME_ZONE})::date,
            ${order.channel}::"SalesChannel", 1, ${order._count.tickets}, ${items}, ${order.amount})
    ON CONFLICT (day, channel) DO UPDATE SET
      orders = daily_sales.orders + EXCLUDED.orders,
      tickets = daily_sales.tickets + EXCLUDED.tickets,
      items = daily_sales.items + EXCLUDED.items,
      revenue = daily_sales.revenue + EXCLUDED.revenue`;
};

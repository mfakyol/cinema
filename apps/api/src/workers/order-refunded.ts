import { CINEMA_TIME_ZONE } from "@sinema/shared";
import type { Handler } from "../messaging/consumer.js";
import type { OrderRefundedPayload } from "../messaging/events.js";
import { mailer } from "../notifications/index.js";
import { buildRefundEmail } from "../notifications/refund-email.js";
import { paymentProvider } from "../payments/index.js";

/**
 * Gives a card payment back through the provider. Like any provider refund it is keyed by the
 * payment reference, and processed_messages stops a redelivered message asking twice. Cash
 * was paid at the counter and is given back there, so there is nothing to call.
 */
export const refundPayment: Handler<OrderRefundedPayload> = async ({ orderId }, tx) => {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { paymentMethod: true, providerRef: true } });
  if (order.paymentMethod === "CARD" && order.providerRef) await paymentProvider.refund(order.providerRef);
};

/** Tells the buyer, when there is an address; at least once, like the ticket email. */
export const sendRefundEmail: Handler<OrderRefundedPayload> = async ({ orderId }) => {
  const email = await buildRefundEmail(orderId);
  if (email) await mailer.send(email);
};

/** Adds the refund to its cinema day (the day of the refund) and channel in daily_sales. */
export const recordRefund: Handler<OrderRefundedPayload> = async ({ orderId }, tx) => {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { amount: true, channel: true, refundedAt: true },
  });
  const refundedAt = order.refundedAt ?? new Date();
  await tx.$executeRaw`
    INSERT INTO daily_sales (day, channel, refunds)
    VALUES ((${refundedAt}::timestamptz AT TIME ZONE ${CINEMA_TIME_ZONE})::date, ${order.channel}::"SalesChannel", ${order.amount})
    ON CONFLICT (day, channel) DO UPDATE SET refunds = daily_sales.refunds + EXCLUDED.refunds`;
};

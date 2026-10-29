import { SocketEvent } from "@sinema/shared";
import { isUniqueViolation, prisma } from "../db.js";
import type { Prisma } from "../generated/prisma/client.js";
import { releaseHolds } from "../holds/seat-holds.js";
import { invalidate } from "../infra/cache.js";
import { createQrToken } from "../lib/qr.js";
import { TICKET_ISSUED } from "../messaging/events.js";
import { paymentProvider } from "../payments/index.js";
import { emitToShowtime } from "../realtime.js";

/** A provider event to record with the outcome, so a redelivered webhook changes nothing. */
export interface WebhookReceipt {
  provider: string;
  eventId: string;
  type: string;
}

export type Outcome =
  | { paid: true; providerRef: string }
  | { paid: false; reason?: string };

export type SettleResult = "paid" | "failed" | "duplicate" | "already-settled" | "seat-taken" | "showtime-cancelled";

class SeatTakenError extends Error {}
class ShowtimeCancelledError extends Error {}

/** Records a webhook event; false when it was already recorded (a redelivery). */
async function recordWebhook(tx: Prisma.TransactionClient, receipt: WebhookReceipt): Promise<boolean> {
  const inserted = await tx.$executeRaw`
    INSERT INTO processed_webhooks (provider, event_id, type)
    VALUES (${receipt.provider}, ${receipt.eventId}, ${receipt.type})
    ON CONFLICT DO NOTHING`;
  return inserted === 1;
}

/** Moves an order out of PENDING; false when it was no longer pending (already settled). */
async function moveFromPending(
  tx: Prisma.TransactionClient,
  orderId: string,
  data: Prisma.OrderUpdateManyMutationInput,
): Promise<boolean> {
  const { count } = await tx.order.updateMany({ where: { id: orderId, status: "PENDING" }, data });
  return count === 1;
}

/**
 * Settles a pending order once its payment outcome is known: from the provider's webhook, or at
 * once for cash at the box office. Everything happens in one transaction:
 *
 * 1. the webhook event is recorded (INSERT ... ON CONFLICT DO NOTHING); already there -> done;
 * 2. the order moves PENDING -> PAID or FAILED with a conditional UPDATE; no row -> done;
 * 3. tickets, item vouchers and the `ticket.issued` outbox event are written.
 *
 * The partial unique index on Ticket is the final guard against double booking: if a seat was
 * sold meanwhile, the transaction rolls back and a second one marks the order FAILED (still
 * recording the event), and the payment is refunded.
 */
export async function settleOrder(orderId: string, outcome: Outcome, receipt?: WebhookReceipt): Promise<SettleResult> {
  let issued: { holderId: string; showtimeId: string; seatIds: string[] } | undefined;
  let refundLater: string | undefined;
  try {
    const result = await prisma.$transaction(async (tx): Promise<SettleResult> => {
      if (receipt && !(await recordWebhook(tx, receipt))) return "duplicate";
      if (!outcome.paid) {
        return (await moveFromPending(tx, orderId, { status: "FAILED" })) ? "failed" : "already-settled";
      }
      if (!(await moveFromPending(tx, orderId, { status: "PAID", providerRef: outcome.providerRef }))) {
        const { status } = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
        // Paid for an order that had already failed (its showtime was cancelled): give it back.
        if (status === "FAILED") refundLater = outcome.providerRef;
        return "already-settled";
      }

      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { items: true, showtime: { select: { cancelledAt: true } } },
      });
      if (order.showtime.cancelledAt) throw new ShowtimeCancelledError();
      try {
        await tx.ticket.createMany({
          data: order.seatIds.map((seatId) => ({
            orderId,
            showtimeId: order.showtimeId,
            seatId,
            userId: order.userId,
            channel: order.channel,
            qrToken: createQrToken(),
          })),
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw new SeatTakenError();
        throw error;
      }
      // One voucher per unit, so each popcorn or pair of glasses has its own QR code.
      await tx.concessionVoucher.createMany({
        data: order.items.flatMap((item) =>
          Array.from({ length: item.quantity }, () => ({ orderItemId: item.id, qrToken: createQrToken() })),
        ),
      });
      // Published to RabbitMQ by the relay after this commits; never lost, never sent for a rollback.
      await tx.outboxEvent.create({ data: { type: TICKET_ISSUED, payload: { orderId } } });
      issued = { holderId: order.holderId, showtimeId: order.showtimeId, seatIds: order.seatIds };
      return "paid";
    });

    if (issued) await afterSale(issued);
    if (refundLater) await paymentProvider.refund(refundLater);
    return result;
  } catch (error) {
    if (!(error instanceof SeatTakenError || error instanceof ShowtimeCancelledError)) throw error;
    const failed = await prisma.$transaction(async (tx) => {
      if (receipt && !(await recordWebhook(tx, receipt))) return false;
      return moveFromPending(tx, orderId, { status: "FAILED" });
    });
    if (failed && outcome.paid) await paymentProvider.refund(outcome.providerRef);
    return error instanceof SeatTakenError ? "seat-taken" : "showtime-cancelled";
  }
}

/** After the commit: the seats are sold, so the holds go, everyone is told and caches refresh. */
async function afterSale({ holderId, showtimeId, seatIds }: { holderId: string; showtimeId: string; seatIds: string[] }) {
  await releaseHolds(holderId, showtimeId, seatIds);
  await invalidate("showtimes", `seatmap:${showtimeId}`);
  emitToShowtime(showtimeId, SocketEvent.SEAT_SOLD, { seatIds });
}

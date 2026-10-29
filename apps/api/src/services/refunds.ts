import { SocketEvent } from "@sinema/shared";
import { prisma } from "../db.js";
import type { Prisma } from "../generated/prisma/client.js";
import { invalidate } from "../infra/cache.js";
import { HttpError } from "../lib/http-error.js";
import { ORDER_REFUNDED } from "../messaging/events.js";
import { emitToShowtime } from "../realtime.js";

class TicketAlreadyUsed extends Error {}

/**
 * Refunds a paid order inside the caller's transaction: PAID -> REFUNDED with a conditional
 * UPDATE, its unused tickets and item vouchers cancelled, and `order.refunded` written to the
 * outbox for the workers (the money back, the email, the stats). False when the order was not
 * PAID any more (already refunded), so a repeat changes nothing.
 *
 * With `refuseUsed`, an order with a ticket already scanned at the door is not refunded. The
 * ticket update locks the rows first, so a scan at the same moment either waits and then finds
 * the ticket cancelled, or finished first and is seen here.
 */
export async function refundOrderInTx(
  tx: Prisma.TransactionClient,
  orderId: string,
  reason: string,
  { refuseUsed = false }: { refuseUsed?: boolean } = {},
): Promise<boolean> {
  const { count } = await tx.order.updateMany({
    where: { id: orderId, status: "PAID" },
    data: { status: "REFUNDED", refundedAt: new Date(), refundReason: reason },
  });
  if (count === 0) return false;
  await tx.ticket.updateMany({ where: { orderId, status: "PAID" }, data: { status: "CANCELLED" } });
  if (refuseUsed && (await tx.ticket.count({ where: { orderId, status: "USED" } })) > 0) {
    throw new TicketAlreadyUsed();
  }
  await tx.concessionVoucher.updateMany({ where: { orderItem: { orderId }, status: "PAID" }, data: { status: "CANCELLED" } });
  await tx.outboxEvent.create({ data: { type: ORDER_REFUNDED, payload: { orderId } } });
  return true;
}

/** An admin refunds one order: all of it, as long as no ticket has been used. */
export async function refundOrder(orderId: string, reason: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { showtimeId: true, seatIds: true } });
  if (!order) throw new HttpError(404, "NOT_FOUND", "Order not found");
  let refunded: boolean;
  try {
    refunded = await prisma.$transaction((tx) => refundOrderInTx(tx, orderId, reason, { refuseUsed: true }));
  } catch (error) {
    if (error instanceof TicketAlreadyUsed) {
      throw new HttpError(409, "ORDER_USED", "A ticket of this order was already used at the door");
    }
    throw error;
  }
  if (!refunded) throw new HttpError(409, "NOT_REFUNDABLE", "Only a paid order can be refunded");

  // The seats are free to sell again.
  await invalidate("showtimes", `seatmap:${order.showtimeId}`);
  emitToShowtime(order.showtimeId, SocketEvent.SEAT_RELEASED, { seatIds: order.seatIds });
}

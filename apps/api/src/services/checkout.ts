import { randomBytes } from "node:crypto";
import { type CheckoutInput, SocketEvent } from "@sinema/shared";
import { isUniqueViolation, prisma } from "../db.js";
import { HttpError } from "../lib/http-error.js";
import type { AuthClaims } from "../lib/jwt.js";
import { createQrToken } from "../lib/qr.js";
import { mailer } from "../notifications/index.js";
import { buildTicketEmail } from "../notifications/ticket-email.js";
import { paymentProvider } from "../payments/index.js";
import { emitToShowtime } from "../realtime.js";

const orderWithTickets = {
  tickets: { select: { id: true, seatId: true, qrToken: true, status: true, channel: true } },
} as const;

async function loadOrder(id: string) {
  return prisma.order.findUniqueOrThrow({ where: { id }, include: orderWithTickets });
}

/**
 * Pays for the caller's locked seats in one showtime and turns them into tickets.
 * Repeating a call with the same idempotency key returns the first result instead of
 * charging again, so a client can safely retry after a timeout.
 */
export async function checkout(auth: AuthClaims, input: CheckoutInput) {
  const existing = await prisma.order.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: orderWithTickets,
  });
  if (existing) {
    if (existing.holderId !== auth.sub) {
      throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "This idempotency key is already used");
    }
    if (existing.status === "FAILED") {
      throw new HttpError(402, "PAYMENT_FAILED", "This checkout already failed; retry with a new key");
    }
    if (existing.status === "PENDING") {
      throw new HttpError(409, "CHECKOUT_IN_PROGRESS", "This checkout is still being processed");
    }
    return existing;
  }

  const now = new Date();
  const locks = await prisma.seatLock.findMany({
    where: { holderId: auth.sub, showtimeId: input.showtimeId, expiresAt: { gt: now } },
    include: { showtime: { select: { price: true } } },
  });
  if (locks.length === 0) {
    throw new HttpError(400, "NO_LOCKS", "Lock seats for this showtime before checking out");
  }

  const isGuest = auth.role === "GUEST";
  const userId = isGuest ? null : auth.sub;
  const channel = isGuest ? (auth.channel ?? "KIOSK") : input.channel;
  const amount = locks[0]!.showtime.price * locks.length;

  let order;
  try {
    order = await prisma.order.create({
      data: {
        holderId: auth.sub,
        userId,
        amount,
        provider: paymentProvider.name,
        idempotencyKey: input.idempotencyKey,
        contactEmail: input.email,
        accessToken: randomBytes(24).toString("base64url"),
      },
    });
  } catch (error) {
    // A concurrent retry with the same key got here first.
    if (isUniqueViolation(error)) {
      throw new HttpError(409, "CHECKOUT_IN_PROGRESS", "This checkout is still being processed");
    }
    throw error;
  }

  const charge = await paymentProvider.charge({
    orderId: order.id,
    amount,
    simulate: input.simulate,
  });
  if (!charge.ok) {
    await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
    throw new HttpError(402, "PAYMENT_DECLINED", charge.reason);
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Payment can outlast the lock. A lock that expired but is still ours is honoured;
      // one the sweeper already removed (and someone may have re-locked) is lost.
      const released = await tx.seatLock.deleteMany({
        where: { id: { in: locks.map((lock) => lock.id) }, holderId: auth.sub },
      });
      if (released.count !== locks.length) {
        throw new HttpError(409, "LOCK_LOST", "A seat lock expired before payment finished");
      }
      await tx.ticket.createMany({
        data: locks.map((lock) => ({
          orderId: order.id,
          showtimeId: lock.showtimeId,
          seatId: lock.seatId,
          userId,
          channel,
          qrToken: createQrToken(),
        })),
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: "PAID", providerRef: charge.providerRef },
      });
    });
  } catch (error) {
    await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
    await paymentProvider.refund(charge.providerRef);
    if (isUniqueViolation(error)) {
      throw new HttpError(409, "SEAT_TAKEN", "A seat was sold before payment finished");
    }
    throw error;
  }

  emitToShowtime(input.showtimeId, SocketEvent.SEAT_SOLD, {
    seatIds: locks.map((lock) => lock.seatId),
  });

  // The sale stands even if the email fails; the order link on the confirmation screen still works.
  try {
    await mailer.send(await buildTicketEmail(order.id, input.locale));
  } catch (error) {
    console.error(`Ticket email for order ${order.id} failed`, error);
  }
  return loadOrder(order.id);
}

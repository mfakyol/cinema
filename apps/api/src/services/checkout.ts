import { randomBytes } from "node:crypto";
import {
  type CheckoutInput,
  type KioskCheckoutInput,
  needsGlasses,
  seatPricing,
  type ShowFormat,
  SocketEvent,
} from "@sinema/shared";
import { isUniqueViolation, prisma } from "../db.js";
import { HttpError } from "../lib/http-error.js";
import type { AuthClaims } from "../lib/jwt.js";
import { createQrToken } from "../lib/qr.js";
import { mailer } from "../notifications/index.js";
import { buildTicketEmail } from "../notifications/ticket-email.js";
import { paymentProvider } from "../payments/index.js";
import type { ChargeResult } from "../payments/provider.js";
import { emitToShowtime } from "../realtime.js";

const orderWithTickets = {
  tickets: { select: { id: true, seatId: true, qrToken: true, status: true, channel: true } },
  items: {
    select: {
      id: true,
      productId: true,
      quantity: true,
      unitPrice: true,
      product: { select: { name: true, category: true } },
      vouchers: { select: { id: true, qrToken: true, status: true }, orderBy: { createdAt: "asc" } },
    },
  },
} as const;

/**
 * Checks the requested snacks, drinks and glasses against the catalogue and prices them.
 * The same product listed twice is merged; 3D glasses are only sold for 3D and IMAX 3D showtimes.
 */
async function priceItems(items: CheckoutInput["items"], format: ShowFormat) {
  const quantities = new Map<string, number>();
  for (const { productId, quantity } of items) {
    quantities.set(productId, (quantities.get(productId) ?? 0) + quantity);
  }
  if (quantities.size === 0) return [];

  const products = await prisma.product.findMany({
    where: { id: { in: [...quantities.keys()] }, active: true },
  });
  if (products.length !== quantities.size) {
    throw new HttpError(400, "INVALID_PRODUCT", "Some products are not on sale");
  }
  if (!needsGlasses(format) && products.some((product) => product.category === "GLASSES")) {
    throw new HttpError(400, "GLASSES_NOT_3D", "3D glasses are only sold for 3D showtimes");
  }
  return products.map((product) => ({
    productId: product.id,
    quantity: quantities.get(product.id)!,
    unitPrice: product.price,
  }));
}

async function loadOrder(id: string) {
  return prisma.order.findUniqueOrThrow({ where: { id }, include: orderWithTickets });
}

/** What a sale needs once the caller is known, whichever app it came from. */
type SaleInput = Omit<CheckoutInput, "channel" | "email"> & {
  channel: "WEB" | "MOBILE" | "KIOSK";
  email: string | null;
  payment: "CARD" | "CASH";
};

/** An online sale by a customer or a guest. */
export function checkout(auth: AuthClaims, input: CheckoutInput) {
  // Guests' channel comes from their session; signed-in customers say which app they use.
  const channel = auth.role === "GUEST" ? (auth.channel ?? "KIOSK") : input.channel;
  return sell(auth, { ...input, channel, payment: "CARD" });
}

/** A box-office sale by staff; the tickets belong to no account. */
export function kioskCheckout(auth: AuthClaims, input: KioskCheckoutInput) {
  return sell(auth, { ...input, channel: "KIOSK", email: input.email ?? null });
}

/**
 * Pays for the caller's locked seats in one showtime and turns them into tickets.
 * Repeating a call with the same idempotency key returns the first result instead of
 * charging again, so a client can safely retry after a timeout.
 */
async function sell(auth: AuthClaims, input: SaleInput) {
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
    include: { showtime: { select: { price: true, startsAt: true, format: true } } },
  });
  if (locks.length === 0) {
    throw new HttpError(400, "NO_LOCKS", "Lock seats for this showtime before checking out");
  }
  const lines = await priceItems(input.items, locks[0]!.showtime.format);

  // Only a customer's own purchase goes to their account.
  const userId = auth.role === "CUSTOMER" ? auth.sub : null;
  const { channel } = input;
  const cash = input.payment === "CASH";
  // Discounts follow from the showtime itself (Wednesday, weekday daytime), never from the client.
  const seatPrice = seatPricing(locks[0]!.showtime).price;
  const amount =
    seatPrice * locks.length +
    lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);

  let order;
  try {
    order = await prisma.order.create({
      data: {
        holderId: auth.sub,
        userId,
        amount,
        provider: cash ? "cash" : paymentProvider.name,
        paymentMethod: input.payment,
        idempotencyKey: input.idempotencyKey,
        contactEmail: input.email,
        accessToken: randomBytes(24).toString("base64url"),
        items: { create: lines },
      },
      include: { items: true },
    });
  } catch (error) {
    // A concurrent retry with the same key got here first.
    if (isUniqueViolation(error)) {
      throw new HttpError(409, "CHECKOUT_IN_PROGRESS", "This checkout is still being processed");
    }
    throw error;
  }

  // Cash is taken at the counter before the sale is confirmed, so there is nothing to charge.
  const charge: ChargeResult = cash
    ? { ok: true, providerRef: `cash-${order.id}` }
    : await paymentProvider.charge({ orderId: order.id, amount, simulate: input.simulate });
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
      // One voucher per unit, so each popcorn or pair of glasses has its own QR code.
      await tx.concessionVoucher.createMany({
        data: order.items.flatMap((item) =>
          Array.from({ length: item.quantity }, () => ({ orderItemId: item.id, qrToken: createQrToken() })),
        ),
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: "PAID", providerRef: charge.providerRef },
      });
    });
  } catch (error) {
    await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
    if (!cash) await paymentProvider.refund(charge.providerRef);
    if (isUniqueViolation(error)) {
      throw new HttpError(409, "SEAT_TAKEN", "A seat was sold before payment finished");
    }
    throw error;
  }

  emitToShowtime(input.showtimeId, SocketEvent.SEAT_SOLD, {
    seatIds: locks.map((lock) => lock.seatId),
  });

  // The sale stands even if the email fails; the order link on the confirmation screen still works.
  if (input.email) {
    try {
      await mailer.send(await buildTicketEmail(order.id, input.locale));
    } catch (error) {
      console.error(`Ticket email for order ${order.id} failed`, error);
    }
  }
  return loadOrder(order.id);
}

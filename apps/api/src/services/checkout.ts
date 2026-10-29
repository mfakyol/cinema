import { randomBytes } from "node:crypto";
import {
  type CheckoutInput,
  type KioskCheckoutInput,
  needsGlasses,
  seatPricing,
  type ShowFormat,
} from "@sinema/shared";
import { prisma } from "../db.js";
import { extendHolds, heldBy } from "../holds/seat-holds.js";
import { HttpError } from "../lib/http-error.js";
import type { AuthClaims } from "../lib/jwt.js";
import { paymentProvider } from "../payments/index.js";
import { settleOrder } from "./settlement.js";

/** Holds are kept at least this long once payment starts, so a slow payment does not lose them. */
const PAYMENT_WINDOW_MS = 3 * 60 * 1000;

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

/** An order as its holder sees it, pending or settled. */
export function loadOrder(id: string) {
  return prisma.order.findUniqueOrThrow({ where: { id }, include: orderWithTickets });
}

/** The holder's own order, to follow a pending payment. Anyone else's looks missing. */
export async function getHolderOrder(holderId: string, orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: orderWithTickets });
  if (!order || order.holderId !== holderId) throw new HttpError(404, "NOT_FOUND", "Order not found");
  return order;
}

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
 * Starts paying for the caller's held seats in one showtime. The order is created PENDING with
 * the seats and prices fixed; a card payment then goes to the provider, whose webhook settles
 * it (202, follow it with GET /checkout/orders/:id). Cash at the box office settles at once
 * (201). Retries are made safe by the Idempotency-Key middleware in front of this.
 */
async function sell(auth: AuthClaims, input: SaleInput): Promise<{ status: 201 | 202; order: Awaited<ReturnType<typeof loadOrder>> }> {
  const holds = await heldBy(auth.sub, input.showtimeId);
  if (holds.length === 0) {
    throw new HttpError(400, "NO_LOCKS", "Lock seats for this showtime before checking out");
  }
  const showtime = await prisma.showtime.findUnique({
    where: { id: input.showtimeId },
    select: { price: true, startsAt: true, format: true },
  });
  if (!showtime) throw new HttpError(404, "NOT_FOUND", "Showtime not found");
  const lines = await priceItems(input.items, showtime.format);

  const seatIds = holds.map((hold) => hold.seatId);
  if (!(await extendHolds(auth.sub, input.showtimeId, seatIds, PAYMENT_WINDOW_MS))) {
    throw new HttpError(409, "LOCK_LOST", "A seat hold expired before payment started");
  }

  // Discounts follow from the showtime itself (Wednesday, weekday daytime), never from the client.
  const seatPrice = seatPricing(showtime).price;
  const amount = seatPrice * seatIds.length + lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const cash = input.payment === "CASH";

  const order = await prisma.order.create({
    data: {
      holderId: auth.sub,
      // Only a customer's own purchase goes to their account.
      userId: auth.role === "CUSTOMER" ? auth.sub : null,
      amount,
      provider: cash ? "cash" : paymentProvider.name,
      paymentMethod: input.payment,
      showtimeId: input.showtimeId,
      seatIds,
      seatPrice,
      channel: input.channel,
      locale: input.locale,
      contactEmail: input.email,
      accessToken: randomBytes(24).toString("base64url"),
      items: { create: lines },
    },
  });

  if (cash) {
    // Cash is taken at the counter before the sale is confirmed, so it settles right away.
    const result = await settleOrder(order.id, { paid: true, providerRef: `cash-${order.id}` });
    if (result === "seat-taken") throw new HttpError(409, "SEAT_TAKEN", "A seat was sold before payment finished");
    return { status: 201, order: await loadOrder(order.id) };
  }

  const { providerRef } = await paymentProvider.charge({ orderId: order.id, amount, simulate: input.simulate });
  await prisma.order.updateMany({ where: { id: order.id, status: "PENDING" }, data: { providerRef } });
  return { status: 202, order: await loadOrder(order.id) };
}

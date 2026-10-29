import { randomUUID } from "node:crypto";
import request from "supertest";
import type { Role } from "@sinema/shared";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { redis } from "../src/infra/redis.js";
import { signToken } from "../src/lib/jwt.js";
import { processOnce } from "../src/messaging/consumer.js";
import { FAKE_SIGNATURE_HEADER, fakePaymentEvent, signFakeWebhook } from "../src/payments/fake-provider.js";
import { queueKioskPrint, recordSale, sendTicketEmail } from "../src/workers/ticket-issued.js";

const app = createApp();

export const api = () => request(app);

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Next Saturday at 20:00 cinema time (17:00 UTC), at least a day away: no automatic discount
 * applies on a Saturday evening, so prices in tests do not depend on the day they run.
 */
export function nextSaturdayEvening(): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 2);
  while (date.getUTCDay() !== 6) date.setUTCDate(date.getUTCDate() + 1);
  date.setUTCHours(17, 0, 0, 0);
  return date;
}

/** A movie, a 2x6 hall and one showtime next Saturday evening at 10.00 a seat. */
export async function createFixture() {
  const movie = await prisma.movie.create({
    data: { title: "Test Movie", description: "A movie for tests.", durationMin: 100, genre: "Drama" },
  });
  const hall = await prisma.hall.create({
    data: {
      name: `Hall ${randomUUID()}`,
      seats: {
        create: ["A", "B"].flatMap((row) =>
          Array.from({ length: 6 }, (_, i) => ({ row, number: i + 1, column: i })),
        ),
      },
    },
    include: { seats: { orderBy: [{ row: "asc" }, { number: "asc" }] } },
  });
  const showtime = await prisma.showtime.create({
    data: {
      movieId: movie.id,
      hallId: hall.id,
      startsAt: nextSaturdayEvening(),
      price: 1000,
    },
  });
  return { movie, hall, seats: hall.seats, showtime };
}

export async function createUser(role: Role = "CUSTOMER") {
  const user = await prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${randomUUID()}@test.local`,
      name: role,
      role,
      passwordHash: "unused",
    },
  });
  return { user, token: signToken({ sub: user.id, role }) };
}

export async function guestToken(channel?: "WEB" | "MOBILE" | "KIOSK"): Promise<string> {
  const res = await api().post("/api/auth/guest").send(channel ? { channel } : {}).expect(201);
  return res.body.token;
}

export function lock(token: string, showtimeId: string, seatIds: string[]) {
  return api().post(`/api/showtimes/${showtimeId}/locks`).set(bearer(token)).send({ seatIds });
}

/** Starts a checkout as a client does: POST with an Idempotency-Key header. */
export function startCheckout(
  token: string,
  showtimeId: string,
  extra: Record<string, unknown> = {},
  { path = "/api/checkout", key = randomUUID() }: { path?: string; key?: string } = {},
) {
  return api()
    .post(path)
    .set(bearer(token))
    .set("Idempotency-Key", key)
    .send({ showtimeId, ...(path === "/api/checkout" ? { email: "buyer@test.local" } : {}), ...extra });
}

/** Sends a payment outcome to the webhook the way the provider does: signed, with an event id. */
export function deliverPaymentEvent(
  orderId: string,
  { type = "payment.succeeded", eventId }: { type?: "payment.succeeded" | "payment.failed"; eventId?: string } = {},
) {
  const body = JSON.stringify(fakePaymentEvent({ id: eventId, type, orderId, providerRef: `fake_${orderId}` }));
  return api()
    .post("/api/webhooks/payments/fake")
    .set("Content-Type", "application/json")
    .set(FAKE_SIGNATURE_HEADER, signFakeWebhook(body))
    .send(body);
}

interface FlowResult {
  status: number;
  // Response bodies, as loosely typed as supertest's.
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * A whole card checkout as a client sees it: start it, let the provider's webhook settle it
 * (declined when `simulate: "decline"`), then read the order. Answers like the old synchronous
 * checkout did, so tests read naturally: 201 with the PAID order, or 402 PAYMENT_DECLINED when
 * the order failed; anything other than 202 from the start (400, 409, cash 201...) is returned
 * as it is. An `idempotencyKey` in `extra` becomes the header.
 */
export function checkout(
  token: string,
  showtimeId: string,
  extra: Record<string, unknown> = {},
  { path = "/api/checkout" }: { path?: string } = {},
): Promise<FlowResult> & { expect: (status: number) => Promise<FlowResult> } {
  const { idempotencyKey, ...body } = extra;
  const run = async (): Promise<FlowResult> => {
    const started = await startCheckout(token, showtimeId, body, {
      path,
      key: (idempotencyKey as string | undefined) ?? randomUUID(),
    });
    if (started.status !== 202) return { status: started.status, body: started.body };
    const orderId = started.body.order.id as string;
    await deliverPaymentEvent(orderId, {
      type: body.simulate === "decline" ? "payment.failed" : "payment.succeeded",
    }).expect(200);
    const final = await api().get(`/api/checkout/orders/${orderId}`).set(bearer(token)).expect(200);
    return final.body.order.status === "PAID"
      ? { status: 201, body: final.body }
      : { status: 402, body: { order: final.body.order, error: { code: "PAYMENT_DECLINED" } } };
  };
  const result = run();
  return Object.assign(result, {
    expect: async (status: number) => {
      const res = await result;
      if (res.status !== status) {
        throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
      }
      return res;
    },
  });
}

const WORKERS = [
  { name: "email", handler: sendTicketEmail },
  { name: "kiosk-print", handler: queueKioskPrint },
  { name: "sales-stats", handler: recordSale },
];

/**
 * Hands every unpublished outbox event to every worker, as the relay and RabbitMQ would, through
 * the same processOnce the consumers use, then marks the events published. A handler that
 * throws is reported, not rethrown, like a message going to the retry queue.
 */
export async function runWorkers(): Promise<Record<string, "processed" | "duplicate" | "failed">> {
  const events = await prisma.outboxEvent.findMany({ where: { publishedAt: null }, orderBy: { createdAt: "asc" } });
  const results: Record<string, "processed" | "duplicate" | "failed"> = {};
  for (const event of events) {
    for (const { name, handler } of WORKERS) {
      try {
        results[`${name}:${event.id}`] = await processOnce(name, event.id, event.payload as never, handler);
      } catch {
        results[`${name}:${event.id}`] = "failed";
      }
    }
  }
  await prisma.outboxEvent.updateMany({ where: { id: { in: events.map((event) => event.id) } }, data: { publishedAt: new Date() } });
  return results;
}

/** Lets every hold in a showtime run out now, as if its ten minutes had passed. */
export async function expireHolds(showtimeId: string): Promise<void> {
  for (const key of await redis.keys(`hold:${showtimeId}:*`)) await redis.pexpire(key, 1);
  await new Promise((resolve) => setTimeout(resolve, 20));
}

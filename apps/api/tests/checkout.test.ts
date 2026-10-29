import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { heldBy, showtimeHolds } from "../src/holds/seat-holds.js";
import { fakeOutcome } from "../src/payments/fake-provider.js";
import { TEST_CARDS } from "@sinema/shared";
import {
  api,
  bearer,
  checkout,
  createFixture,
  createUser,
  deliverPaymentEvent,
  expireHolds,
  guestToken,
  lock,
  startCheckout,
} from "./helpers.js";

describe("checkout", () => {
  it("turns held seats into paid tickets once the payment webhook arrives", async () => {
    const { showtime, seats } = await createFixture();
    const { user, token } = await createUser();
    await lock(token, showtime.id, [seats[0]!.id, seats[1]!.id]).expect(201);

    const started = await startCheckout(token, showtime.id, { channel: "MOBILE" }).expect(202);
    expect(started.body.order).toMatchObject({ status: "PENDING", amount: 2000, tickets: [] });

    await deliverPaymentEvent(started.body.order.id).expect(200);
    const { body } = await api().get(`/api/checkout/orders/${started.body.order.id}`).set(bearer(token)).expect(200);
    expect(body.order).toMatchObject({ status: "PAID", userId: user.id });
    expect(body.order.tickets).toHaveLength(2);
    expect(body.order.tickets[0]).toMatchObject({ status: "PAID", channel: "MOBILE" });

    // Sold seats are no longer held, and everyone sees them sold.
    expect(await showtimeHolds(showtime.id)).toHaveLength(0);
    const map = await api().get(`/api/showtimes/${showtime.id}/seats`);
    expect(map.body.seats.slice(0, 2).map((seat: { state: string }) => seat.state)).toEqual(["sold", "sold"]);

    const mine = await api().get("/api/me/tickets").set(bearer(token)).expect(200);
    expect(mine.body.tickets).toHaveLength(2);
    expect(mine.body.tickets[0].showtime.movie.title).toBe("Test Movie");
  });

  it("writes the ticket.issued event to the outbox in the same transaction as the tickets", async () => {
    const { showtime, seats } = await createFixture();
    const { token } = await createUser();
    await lock(token, showtime.id, [seats[0]!.id]).expect(201);

    const started = await startCheckout(token, showtime.id).expect(202);
    expect(await prisma.outboxEvent.count()).toBe(0);
    await deliverPaymentEvent(started.body.order.id).expect(200);

    const events = await prisma.outboxEvent.findMany();
    expect(events).toEqual([
      expect.objectContaining({ type: "ticket.issued", payload: { orderId: started.body.order.id }, publishedAt: null }),
    ]);
  });

  it("sells kiosk tickets without a user, on the KIOSK channel", async () => {
    const { showtime, seats } = await createFixture();
    const token = await guestToken();
    await lock(token, showtime.id, [seats[0]!.id]).expect(201);

    const res = await checkout(token, showtime.id, { channel: "WEB" }).expect(201);
    expect(res.body.order.userId).toBeNull();
    expect(res.body.order.tickets[0].channel).toBe("KIOSK");
  });

  it("lets a web guest buy without an account and see the tickets on that device", async () => {
    const { showtime, seats } = await createFixture();
    const token = await guestToken("WEB");
    const other = await guestToken("WEB");
    await lock(token, showtime.id, [seats[0]!.id]).expect(201);

    const res = await checkout(token, showtime.id, { channel: "MOBILE" }).expect(201);
    expect(res.body.order.userId).toBeNull();
    expect(res.body.order.tickets[0].channel).toBe("WEB");

    const mine = await api().get("/api/me/tickets").set(bearer(token)).expect(200);
    expect(mine.body.tickets).toHaveLength(1);
    const theirs = await api().get("/api/me/tickets").set(bearer(other)).expect(200);
    expect(theirs.body.tickets).toHaveLength(0);
  });

  it("keeps the holds when the payment is declined, so the customer can try again", async () => {
    const { showtime, seats } = await createFixture();
    const { user, token } = await createUser();
    await lock(token, showtime.id, [seats[0]!.id]).expect(201);

    const res = await checkout(token, showtime.id, { simulate: "decline" }).expect(402);
    expect(res.body.error!.code).toBe("PAYMENT_DECLINED");
    expect(await prisma.ticket.count()).toBe(0);
    expect(await heldBy(user.id, showtime.id)).toHaveLength(1);
    expect((await prisma.order.findFirstOrThrow()).status).toBe("FAILED");

    // A new attempt (a new key) goes through.
    await checkout(token, showtime.id).expect(201);
  });

  it("takes a card on the payment step and checks it", async () => {
    const { showtime, seats } = await createFixture();
    const { token } = await createUser();
    await lock(token, showtime.id, [seats[0]!.id]).expect(201);

    const bad = await startCheckout(token, showtime.id, { card: { ...TEST_CARDS.approved, number: "4242424242424241" } }).expect(400);
    expect(bad.body.error.code).toBe("VALIDATION");
    const expired = await startCheckout(token, showtime.id, { card: { ...TEST_CARDS.approved, expiry: "01/20" } }).expect(400);
    expect(expired.body.error.code).toBe("VALIDATION");
    await startCheckout(token, showtime.id, { card: TEST_CARDS.approved }).expect(202);

    // The fake provider approves the approved test card and declines the declined one.
    expect(fakeOutcome({ orderId: "o", amount: 1, card: TEST_CARDS.approved })).toBe("payment.succeeded");
    expect(fakeOutcome({ orderId: "o", amount: 1, card: TEST_CARDS.declined })).toBe("payment.failed");
  });

  it("requires holds first", async () => {
    const { showtime } = await createFixture();
    const { token } = await createUser();
    const res = await startCheckout(token, showtime.id).expect(400);
    expect(res.body.error.code).toBe("NO_LOCKS");
  });

  it("does not sell a seat whose hold ran out and was taken by someone else", async () => {
    const { showtime, seats } = await createFixture();
    const late = await createUser();
    const other = await createUser();
    await lock(late.token, showtime.id, [seats[0]!.id]).expect(201);

    await expireHolds(showtime.id);
    await lock(other.token, showtime.id, [seats[0]!.id]).expect(201);

    const res = await startCheckout(late.token, showtime.id).expect(400);
    expect(res.body.error.code).toBe("NO_LOCKS");
    expect(await prisma.ticket.count()).toBe(0);
  });

  it("lets only one of two paid orders for the same seat get the ticket", async () => {
    // Two buyers end up paying for one seat: the first one's hold ran out mid-payment and the
    // second took the seat. Both payments succeed at the same moment; the partial unique index
    // decides, and the loser's order fails and is refunded.
    const { showtime, seats } = await createFixture();
    const first = await createUser();
    const second = await createUser();
    await lock(first.token, showtime.id, [seats[0]!.id]).expect(201);
    const firstOrder = (await startCheckout(first.token, showtime.id).expect(202)).body.order.id;
    await expireHolds(showtime.id);
    await lock(second.token, showtime.id, [seats[0]!.id]).expect(201);
    const secondOrder = (await startCheckout(second.token, showtime.id).expect(202)).body.order.id;

    const results = await Promise.all([deliverPaymentEvent(firstOrder), deliverPaymentEvent(secondOrder)]);
    expect(results.map((res) => res.body.result).sort()).toEqual(["paid", "seat-taken"]);

    expect(await prisma.ticket.count({ where: { seatId: seats[0]!.id } })).toBe(1);
    const statuses = (await prisma.order.findMany({ orderBy: { createdAt: "asc" } })).map((order) => order.status);
    expect(statuses.sort()).toEqual(["FAILED", "PAID"]);
  });
});

describe("idempotency keys", () => {
  it("returns the stored response for a repeated key and creates one order", async () => {
    const { showtime, seats } = await createFixture();
    const { token } = await createUser();
    await lock(token, showtime.id, [seats[0]!.id]).expect(201);
    const key = randomUUID();

    const first = await startCheckout(token, showtime.id, {}, { key }).expect(202);
    const retry = await startCheckout(token, showtime.id, {}, { key }).expect(202);
    expect(retry.headers["idempotent-replayed"]).toBe("true");
    expect(retry.body).toEqual(first.body);
    expect(await prisma.order.count()).toBe(1);
  });

  it("lets exactly one of two simultaneous requests with the same key run", async () => {
    const { showtime, seats } = await createFixture();
    const { token } = await createUser();
    await lock(token, showtime.id, [seats[0]!.id]).expect(201);
    const key = randomUUID();

    const results = await Promise.all([
      startCheckout(token, showtime.id, {}, { key }),
      startCheckout(token, showtime.id, {}, { key }),
    ]);
    const statuses = results.map((res) => res.status).sort();
    // The second either finds the first still running (409) or already done (a replay).
    expect([[202, 202], [202, 409]]).toContainEqual(statuses);
    expect(await prisma.order.count()).toBe(1);
  });

  it("refuses a key reused for a different request", async () => {
    const { showtime, seats } = await createFixture();
    const { token } = await createUser();
    await lock(token, showtime.id, [seats[0]!.id]).expect(201);
    const key = randomUUID();

    await startCheckout(token, showtime.id, {}, { key }).expect(202);
    const res = await startCheckout(token, showtime.id, { locale: "tr" }, { key }).expect(422);
    expect(res.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("keeps keys per caller, so the same key from someone else is a new request", async () => {
    const { showtime, seats } = await createFixture();
    const first = await createUser();
    const second = await createUser();
    const key = randomUUID();
    await lock(first.token, showtime.id, [seats[0]!.id]).expect(201);
    await lock(second.token, showtime.id, [seats[1]!.id]).expect(201);

    await startCheckout(first.token, showtime.id, {}, { key }).expect(202);
    await startCheckout(second.token, showtime.id, {}, { key }).expect(202);
    expect(await prisma.order.count()).toBe(2);
  });

  it("requires the header", async () => {
    const { showtime, seats } = await createFixture();
    const { token } = await createUser();
    await lock(token, showtime.id, [seats[0]!.id]).expect(201);
    const res = await api()
      .post("/api/checkout")
      .set(bearer(token))
      .send({ showtimeId: showtime.id, email: "buyer@test.local" })
      .expect(400);
    expect(res.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });
});

describe("payment webhooks", () => {
  it("handles the same event delivered twice only once", async () => {
    const { showtime, seats } = await createFixture();
    const { token } = await createUser();
    await lock(token, showtime.id, [seats[0]!.id, seats[1]!.id]).expect(201);
    const orderId = (await startCheckout(token, showtime.id).expect(202)).body.order.id;
    const eventId = `evt_${randomUUID()}`;

    const first = await deliverPaymentEvent(orderId, { eventId }).expect(200);
    const again = await deliverPaymentEvent(orderId, { eventId }).expect(200);
    expect(first.body.result).toBe("paid");
    expect(again.body.result).toBe("duplicate");
    expect(await prisma.ticket.count()).toBe(2);
    expect(await prisma.outboxEvent.count()).toBe(1);
    expect(await prisma.processedWebhook.count()).toBe(1);
  });

  it("handles the same event delivered twice at the same moment only once", async () => {
    const { showtime, seats } = await createFixture();
    const { token } = await createUser();
    await lock(token, showtime.id, [seats[0]!.id]).expect(201);
    const orderId = (await startCheckout(token, showtime.id).expect(202)).body.order.id;
    const eventId = `evt_${randomUUID()}`;

    const results = await Promise.all([deliverPaymentEvent(orderId, { eventId }), deliverPaymentEvent(orderId, { eventId })]);
    expect(results.map((res) => res.status)).toEqual([200, 200]);
    expect(results.map((res) => res.body.result).sort()).toEqual(["duplicate", "paid"]);
    expect(await prisma.ticket.count()).toBe(1);
  });

  it("does nothing for a second, different success event of a paid order", async () => {
    const { showtime, seats } = await createFixture();
    const { token } = await createUser();
    await lock(token, showtime.id, [seats[0]!.id]).expect(201);
    const orderId = (await startCheckout(token, showtime.id).expect(202)).body.order.id;

    await deliverPaymentEvent(orderId).expect(200);
    const later = await deliverPaymentEvent(orderId).expect(200);
    // The conditional UPDATE ... WHERE status = 'PENDING' touches no row the second time.
    expect(later.body.result).toBe("already-settled");
    expect(await prisma.ticket.count()).toBe(1);
  });

  it("rejects a webhook with a wrong signature", async () => {
    const res = await api()
      .post("/api/webhooks/payments/fake")
      .set("Content-Type", "application/json")
      .set("x-fake-signature", "00".repeat(32))
      .send(JSON.stringify({ id: "evt_forged", type: "payment.succeeded", orderId: "x", providerRef: "y" }))
      .expect(401);
    expect(res.body.error.code).toBe("INVALID_SIGNATURE");
    expect(await prisma.processedWebhook.count()).toBe(0);
  });
});

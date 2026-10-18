import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { releaseExpiredLocks } from "../src/services/locks.js";
import { api, bearer, checkout, createFixture, createUser, guestToken, lock } from "./helpers.js";

describe("checkout", () => {
  it("turns locked seats into paid tickets and marks them sold", async () => {
    const { showtime, seats } = await createFixture();
    const { user, token } = await createUser();
    await lock(token, showtime.id, [seats[0]!.id, seats[1]!.id]).expect(201);

    const res = await checkout(token, showtime.id, { channel: "MOBILE" }).expect(201);
    expect(res.body.order).toMatchObject({ status: "PAID", amount: 2000, userId: user.id });
    expect(res.body.order.tickets).toHaveLength(2);
    expect(res.body.order.tickets[0]).toMatchObject({ status: "PAID", channel: "MOBILE" });

    expect(await prisma.seatLock.count()).toBe(0);
    const map = await api().get(`/api/showtimes/${showtime.id}/seats`);
    const states = map.body.seats.slice(0, 2).map((seat: { state: string }) => seat.state);
    expect(states).toEqual(["sold", "sold"]);

    const mine = await api().get("/api/me/tickets").set(bearer(token)).expect(200);
    expect(mine.body.tickets).toHaveLength(2);
    expect(mine.body.tickets[0].showtime.movie.title).toBe("Test Movie");
  });

  it("sells kiosk tickets without a user, on the KIOSK channel", async () => {
    const { showtime, seats } = await createFixture();
    const token = await guestToken();
    await lock(token, showtime.id, [seats[0]!.id]).expect(201);

    const res = await checkout(token, showtime.id, { channel: "WEB" }).expect(201);
    expect(res.body.order.userId).toBeNull();
    expect(res.body.order.tickets[0].channel).toBe("KIOSK");
  });

  it("returns the same order when retried with the same idempotency key", async () => {
    const { showtime, seats } = await createFixture();
    const { token } = await createUser();
    await lock(token, showtime.id, [seats[0]!.id]).expect(201);
    const idempotencyKey = randomUUID();

    const first = await checkout(token, showtime.id, { idempotencyKey }).expect(201);
    const retry = await checkout(token, showtime.id, { idempotencyKey }).expect(201);
    expect(retry.body.order.id).toBe(first.body.order.id);
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.ticket.count()).toBe(1);
  });

  it("does not let another holder reuse an idempotency key", async () => {
    const { showtime, seats } = await createFixture();
    const first = await createUser();
    const second = await createUser();
    const idempotencyKey = randomUUID();
    await lock(first.token, showtime.id, [seats[0]!.id]).expect(201);
    await checkout(first.token, showtime.id, { idempotencyKey }).expect(201);

    const res = await checkout(second.token, showtime.id, { idempotencyKey }).expect(409);
    expect(res.body.error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("keeps the locks when the payment is declined", async () => {
    const { showtime, seats } = await createFixture();
    const { token } = await createUser();
    await lock(token, showtime.id, [seats[0]!.id]).expect(201);

    const res = await checkout(token, showtime.id, { simulate: "decline" }).expect(402);
    expect(res.body.error.code).toBe("PAYMENT_DECLINED");
    expect(await prisma.ticket.count()).toBe(0);
    expect(await prisma.seatLock.count()).toBe(1);
    expect((await prisma.order.findFirstOrThrow()).status).toBe("FAILED");

    // The customer can try again with a new key.
    await checkout(token, showtime.id).expect(201);
  });

  it("requires locks first", async () => {
    const { showtime } = await createFixture();
    const { token } = await createUser();
    const res = await checkout(token, showtime.id).expect(400);
    expect(res.body.error.code).toBe("NO_LOCKS");
  });

  it("does not sell a seat whose lock was swept and taken by someone else", async () => {
    const { showtime, seats } = await createFixture();
    const late = await createUser();
    const other = await createUser();
    await lock(late.token, showtime.id, [seats[0]!.id]).expect(201);

    // The lock runs out: the sweeper frees the seat and someone else locks it.
    await prisma.seatLock.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await releaseExpiredLocks();
    await lock(other.token, showtime.id, [seats[0]!.id]).expect(201);

    const res = await checkout(late.token, showtime.id).expect(400);
    expect(res.body.error.code).toBe("NO_LOCKS");
    expect(await prisma.ticket.count()).toBe(0);
  });
});

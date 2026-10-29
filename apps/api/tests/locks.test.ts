import { MAX_LOCKS_PER_HOLDER } from "@sinema/shared";
import { describe, expect, it } from "vitest";
import { heldCounts, showtimeHolds } from "../src/holds/seat-holds.js";
import { prisma } from "../src/db.js";
import { api, bearer, createFixture, createUser, expireHolds, guestToken, lock } from "./helpers.js";

describe("seat holds", () => {
  it("holds seats and shows hold details only to the holder", async () => {
    const { showtime, seats } = await createFixture();
    const { token } = await createUser();
    const other = await createUser();

    const res = await lock(token, showtime.id, [seats[0]!.id, seats[1]!.id]).expect(201);
    expect(res.body.locks).toHaveLength(2);

    const mine = await api().get(`/api/showtimes/${showtime.id}/seats`).set(bearer(token));
    expect(mine.body.seats[0]).toMatchObject({ state: "locked", lockId: expect.any(String) });

    const theirs = await api().get(`/api/showtimes/${showtime.id}/seats`).set(bearer(other.token));
    expect(theirs.body.seats[0].state).toBe("locked");
    expect(theirs.body.seats[0]).not.toHaveProperty("lockId");
  });

  it("holds a seat for ten minutes", async () => {
    const { showtime, seats } = await createFixture();
    const { token } = await createUser();
    const before = Date.now();
    const res = await lock(token, showtime.id, [seats[0]!.id]).expect(201);
    const expiresAt = new Date(res.body.locks[0].expiresAt).getTime();
    expect(expiresAt - before).toBeGreaterThanOrEqual(10 * 60 * 1000 - 1000);
    expect(expiresAt - before).toBeLessThanOrEqual(10 * 60 * 1000 + 1000);
  });

  it("refuses a seat someone else holds, and takes none of the request", async () => {
    const { showtime, seats } = await createFixture();
    const first = await createUser();
    const second = await guestToken();

    await lock(first.token, showtime.id, [seats[0]!.id]).expect(201);
    const res = await lock(second, showtime.id, [seats[0]!.id, seats[1]!.id]).expect(409);
    expect(res.body.error.code).toBe("SEAT_TAKEN");
    // All or nothing: the free seat in the refused request stays free.
    expect((await showtimeHolds(showtime.id)).map((hold) => hold.seatId)).toEqual([seats[0]!.id]);
  });

  it("lets exactly one of many concurrent requests win the same seat", async () => {
    const { showtime, seats } = await createFixture();
    const tokens = await Promise.all(Array.from({ length: 8 }, () => guestToken()));

    const results = await Promise.all(tokens.map((token) => lock(token, showtime.id, [seats[0]!.id])));
    const statuses = results.map((res) => res.status);

    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(tokens.length - 1);
    expect(await showtimeHolds(showtime.id)).toHaveLength(1);
  });

  it(`caps a holder at ${MAX_LOCKS_PER_HOLDER} seats`, async () => {
    const { showtime, seats } = await createFixture();
    const { token } = await createUser();
    const ids = seats.map((seat) => seat.id);

    await lock(token, showtime.id, ids.slice(0, MAX_LOCKS_PER_HOLDER)).expect(201);
    const res = await lock(token, showtime.id, [ids[MAX_LOCKS_PER_HOLDER]!]).expect(409);
    expect(res.body.error.code).toBe("LOCK_LIMIT");
  });

  it("releases a holder's seats in other showtimes when they hold in a new one", async () => {
    const first = await createFixture();
    const second = await createFixture();
    const { token } = await createUser();
    const other = await createUser();

    await lock(token, first.showtime.id, [first.seats[0]!.id, first.seats[1]!.id]).expect(201);
    await lock(token, second.showtime.id, [second.seats[0]!.id]).expect(201);

    const counts = await heldCounts([first.showtime.id, second.showtime.id]);
    expect(counts.get(first.showtime.id)).toBe(0);
    expect(counts.get(second.showtime.id)).toBe(1);
    // The seats left behind are free for anyone straight away.
    await lock(other.token, first.showtime.id, [first.seats[0]!.id]).expect(201);
  });

  it("frees a seat by itself when its hold expires", async () => {
    const { showtime, seats } = await createFixture();
    const first = await createUser();
    const second = await createUser();

    await lock(first.token, showtime.id, [seats[0]!.id]).expect(201);
    await expireHolds(showtime.id);

    const map = await api().get(`/api/showtimes/${showtime.id}/seats`);
    expect(map.body.seats[0].state).toBe("free");
    await lock(second.token, showtime.id, [seats[0]!.id]).expect(201);
  });

  it("rejects seats from another hall", async () => {
    const { showtime } = await createFixture();
    const other = await createFixture();
    const { token } = await createUser();
    const res = await lock(token, showtime.id, [other.seats[0]!.id]).expect(400);
    expect(res.body.error.code).toBe("INVALID_SEAT");
  });

  it("rejects showtimes that already started", async () => {
    const { showtime, seats } = await createFixture();
    await prisma.showtime.update({
      where: { id: showtime.id },
      data: { startsAt: new Date(Date.now() - 60_000) },
    });
    const { token } = await createUser();
    const res = await lock(token, showtime.id, [seats[0]!.id]).expect(409);
    expect(res.body.error.code).toBe("SHOWTIME_STARTED");
  });

  it("requires a token", async () => {
    const { showtime, seats } = await createFixture();
    await api()
      .post(`/api/showtimes/${showtime.id}/locks`)
      .send({ seatIds: [seats[0]!.id] })
      .expect(401);
  });

  it("releases a hold only for its holder", async () => {
    const { showtime, seats } = await createFixture();
    const holder = await createUser();
    const other = await createUser();
    const res = await lock(holder.token, showtime.id, [seats[0]!.id]).expect(201);
    const lockId = res.body.locks[0].id;

    await api().delete(`/api/locks/${lockId}`).set(bearer(other.token)).expect(404);
    await api().delete(`/api/locks/${lockId}`).set(bearer(holder.token)).expect(204);
    expect(await showtimeHolds(showtime.id)).toHaveLength(0);
  });

  it("limits how fast one caller can hold seats", async () => {
    const { showtime, seats } = await createFixture();
    const { token } = await createUser();
    // 60 a minute are allowed; the same seat again just extends the hold.
    for (let i = 0; i < 60; i++) await lock(token, showtime.id, [seats[0]!.id]).expect(201);
    const limited = await lock(token, showtime.id, [seats[0]!.id]).expect(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
  });
});

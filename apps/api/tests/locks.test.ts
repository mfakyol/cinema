import { MAX_LOCKS_PER_HOLDER } from "@sinema/shared";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { releaseExpiredLocks } from "../src/services/locks.js";
import { api, bearer, createFixture, createUser, guestToken, lock } from "./helpers.js";

const expireAllLocks = () =>
  prisma.seatLock.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

describe("seat locks", () => {
  it("locks seats and shows lock details only to the holder", async () => {
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

  it("refuses a seat someone else holds", async () => {
    const { showtime, seats } = await createFixture();
    const first = await createUser();
    const second = await guestToken();

    await lock(first.token, showtime.id, [seats[0]!.id]).expect(201);
    const res = await lock(second, showtime.id, [seats[0]!.id, seats[1]!.id]).expect(409);
    expect(res.body.error.code).toBe("SEAT_TAKEN");
    // The whole request fails, so the free seat in it stays free.
    expect(await prisma.seatLock.count({ where: { seatId: seats[1]!.id } })).toBe(0);
  });

  it("lets exactly one of many concurrent requests win the same seat", async () => {
    const { showtime, seats } = await createFixture();
    const tokens = await Promise.all(Array.from({ length: 8 }, () => guestToken()));

    const results = await Promise.all(tokens.map((token) => lock(token, showtime.id, [seats[0]!.id])));
    const statuses = results.map((res) => res.status);

    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(tokens.length - 1);
    expect(await prisma.seatLock.count({ where: { seatId: seats[0]!.id } })).toBe(1);
  });

  it(`caps a holder at ${MAX_LOCKS_PER_HOLDER} seats`, async () => {
    const { showtime, seats } = await createFixture();
    const { token } = await createUser();
    const ids = seats.map((seat) => seat.id);

    await lock(token, showtime.id, ids.slice(0, MAX_LOCKS_PER_HOLDER)).expect(201);
    const res = await lock(token, showtime.id, [ids[MAX_LOCKS_PER_HOLDER]!]).expect(409);
    expect(res.body.error.code).toBe("LOCK_LIMIT");
  });

  it("releases a holder's seats in other showtimes when they lock in a new one", async () => {
    const first = await createFixture();
    const second = await createFixture();
    const { token } = await createUser();
    const other = await createUser();

    await lock(token, first.showtime.id, [first.seats[0]!.id, first.seats[1]!.id]).expect(201);
    await lock(token, second.showtime.id, [second.seats[0]!.id]).expect(201);

    expect(await prisma.seatLock.count({ where: { showtimeId: first.showtime.id } })).toBe(0);
    expect(await prisma.seatLock.count({ where: { showtimeId: second.showtime.id } })).toBe(1);
    // The seats left behind are free for anyone straight away.
    await lock(other.token, first.showtime.id, [first.seats[0]!.id]).expect(201);
  });

  it("lets another holder take a seat whose lock expired", async () => {
    const { showtime, seats } = await createFixture();
    const first = await createUser();
    const second = await createUser();

    await lock(first.token, showtime.id, [seats[0]!.id]).expect(201);
    await expireAllLocks();

    const map = await api().get(`/api/showtimes/${showtime.id}/seats`);
    expect(map.body.seats[0].state).toBe("free");
    await lock(second.token, showtime.id, [seats[0]!.id]).expect(201);
  });

  it("sweeps expired locks", async () => {
    const { showtime, seats } = await createFixture();
    const { token } = await createUser();
    await lock(token, showtime.id, [seats[0]!.id, seats[1]!.id]).expect(201);
    await expireAllLocks();

    expect(await releaseExpiredLocks()).toBe(2);
    expect(await prisma.seatLock.count()).toBe(0);
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

  it("requires a customer or guest token", async () => {
    const { showtime, seats } = await createFixture();
    await api()
      .post(`/api/showtimes/${showtime.id}/locks`)
      .send({ seatIds: [seats[0]!.id] })
      .expect(401);
    const staff = await createUser("STAFF");
    await lock(staff.token, showtime.id, [seats[0]!.id]).expect(403);
  });

  it("releases a lock only for its holder", async () => {
    const { showtime, seats } = await createFixture();
    const holder = await createUser();
    const other = await createUser();
    const res = await lock(holder.token, showtime.id, [seats[0]!.id]).expect(201);
    const lockId = res.body.locks[0].id;

    await api().delete(`/api/locks/${lockId}`).set(bearer(other.token)).expect(404);
    await api().delete(`/api/locks/${lockId}`).set(bearer(holder.token)).expect(204);
    expect(await prisma.seatLock.count()).toBe(0);
  });
});

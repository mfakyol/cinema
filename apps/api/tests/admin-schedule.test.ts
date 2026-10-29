import { cinemaTime } from "@sinema/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db.js";
import { mailer } from "../src/notifications/index.js";
import { paymentProvider } from "../src/payments/index.js";
import {
  api,
  bearer,
  checkout,
  createFixture,
  createUser,
  deliverPaymentEvent,
  lock,
  runWorkers,
  startCheckout,
} from "./helpers.js";

const admin = async () => bearer((await createUser("ADMIN")).token);
const minutes = (n: number) => n * 60_000;

/** A paid order of one seat in the fixture's showtime. */
async function paidOrder(showtimeId: string, seatId: string) {
  const { token } = await createUser();
  await lock(token, showtimeId, [seatId]).expect(201);
  const res = await checkout(token, showtimeId).expect(201);
  return { token, order: res.body.order as { id: string; accessToken: string; tickets: { qrToken: string }[] } };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("admin: movies", () => {
  it("adds and edits a movie", async () => {
    const auth = await admin();
    const movie = { title: "Dune", description: "Sand.", durationMin: 155, genre: "Sci-fi", posterUrl: null };
    const created = await api().post("/api/admin/movies").set(auth).send(movie).expect(201);
    const edited = await api()
      .put(`/api/admin/movies/${created.body.movie.id}`)
      .set(auth)
      .send({ ...movie, title: "Dune: Part One" })
      .expect(200);
    expect(edited.body.movie.title).toBe("Dune: Part One");
    const list = await api().get("/api/admin/movies").set(auth).expect(200);
    expect(list.body.movies).toEqual([expect.objectContaining({ title: "Dune: Part One", upcomingShowtimes: 0 })]);
    await api().post("/api/admin/movies").set(auth).send({ ...movie, durationMin: 5 }).expect(400);
  });
});

describe("admin: showtimes", () => {
  it("adds a showtime only where the hall is free and shows the format", async () => {
    const auth = await admin();
    const { movie, hall, showtime } = await createFixture();
    const base = { movieId: movie.id, hallId: hall.id, format: "TWO_D", price: 1000 };
    // The fixture's film runs 100 minutes, then 25 of turnaround.
    const clash = new Date(showtime.startsAt.getTime() + minutes(120));
    const free = new Date(showtime.startsAt.getTime() + minutes(125));

    const busy = await api().post("/api/admin/showtimes").set(auth).send({ ...base, startsAt: clash }).expect(409);
    expect(busy.body.error.code).toBe("HALL_BUSY");
    const before = await api().post("/api/admin/showtimes").set(auth).send({ ...base, startsAt: new Date(showtime.startsAt.getTime() - minutes(60)) }).expect(409);
    expect(before.body.error.code).toBe("HALL_BUSY");
    const format = await api().post("/api/admin/showtimes").set(auth).send({ ...base, format: "IMAX", startsAt: free }).expect(400);
    expect(format.body.error.code).toBe("FORMAT_NOT_IN_HALL");
    const past = await api().post("/api/admin/showtimes").set(auth).send({ ...base, startsAt: new Date(Date.now() - 60_000) }).expect(400);
    expect(past.body.error.code).toBe("SHOWTIME_IN_PAST");

    const created = await api().post("/api/admin/showtimes").set(auth).send({ ...base, startsAt: free }).expect(201);
    expect(created.body.showtime).toMatchObject({ sold: 0, seatCount: 12, cancelledAt: null });
  });

  it("does not let two admins fill the same slot at the same moment", async () => {
    const auth = await admin();
    const { movie, hall, showtime } = await createFixture();
    const slot = { movieId: movie.id, hallId: hall.id, format: "TWO_D", price: 1000, startsAt: new Date(showtime.startsAt.getTime() + minutes(200)) };
    const results = await Promise.all([
      api().post("/api/admin/showtimes").set(auth).send(slot),
      api().post("/api/admin/showtimes").set(auth).send(slot),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
  });

  it("adds the same times every day and skips the ones that clash", async () => {
    const auth = await admin();
    const { movie, hall } = await createFixture();
    // Weeks away, clear of the fixture's own showtime next Saturday.
    const tomorrow = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
    const dayAfter = new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10);
    const body = { movieId: movie.id, hallId: hall.id, format: "TWO_D", price: 1000, from: tomorrow, to: dayAfter, times: ["20:00", "14:00"] };

    const first = await api().post("/api/admin/showtimes/bulk").set(auth).send(body).expect(201);
    expect(first.body).toEqual({ created: 4, skipped: [] });
    expect(await prisma.showtime.count({ where: { startsAt: cinemaTime(tomorrow, "14:00") } })).toBe(1);

    const again = await api().post("/api/admin/showtimes/bulk").set(auth).send(body).expect(201);
    expect(again.body.created).toBe(0);
    expect(again.body.skipped.map((row: { reason: string }) => row.reason)).toEqual(["HALL_BUSY", "HALL_BUSY", "HALL_BUSY", "HALL_BUSY"]);
  });
});

describe("cancelling a showtime", () => {
  it("refunds every paid order, fails pending ones and closes the showtime", async () => {
    const auth = await admin();
    const { showtime, seats } = await createFixture();
    const paid = await paidOrder(showtime.id, seats[0]!.id);
    const pendingBuyer = await createUser();
    await lock(pendingBuyer.token, showtime.id, [seats[1]!.id]).expect(201);
    const pending = (await startCheckout(pendingBuyer.token, showtime.id).expect(202)).body.order.id;

    const res = await api().post(`/api/admin/showtimes/${showtime.id}/cancel`).set(auth).send({ reason: "Projector failure" }).expect(200);
    expect(res.body).toEqual({ refunded: 1, failedPending: 1 });

    expect(await prisma.order.findUniqueOrThrow({ where: { id: paid.order.id } })).toMatchObject({ status: "REFUNDED", refundReason: "Projector failure" });
    expect(await prisma.ticket.findMany({ where: { orderId: paid.order.id } })).toEqual([expect.objectContaining({ status: "CANCELLED" })]);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: pending } })).status).toBe("FAILED");
    expect(await prisma.outboxEvent.count({ where: { type: "order.refunded" } })).toBe(1);

    // Gone from the lists, no new holds, and the buyer's link shows the refund.
    await api().get(`/api/showtimes/${showtime.id}/seats`).expect(404);
    const other = await createUser();
    expect((await lock(other.token, showtime.id, [seats[2]!.id]).expect(409)).body.error.code).toBe("SHOWTIME_CANCELLED");
    const page = await api().get(`/api/orders/${paid.order.accessToken}`).expect(200);
    expect(page.body.order).toMatchObject({ status: "REFUNDED", refundReason: "Projector failure" });

    await api().post(`/api/admin/showtimes/${showtime.id}/cancel`).set(auth).send({ reason: "Again" }).expect(409);
  });

  it("gives the money back and emails the buyer through the workers", async () => {
    const auth = await admin();
    const { showtime, seats } = await createFixture();
    const { order } = await paidOrder(showtime.id, seats[0]!.id);
    await runWorkers();
    const refund = vi.spyOn(paymentProvider, "refund");
    const send = vi.spyOn(mailer, "send");

    await api().post(`/api/admin/showtimes/${showtime.id}/cancel`).set(auth).send({ reason: "Projector failure" }).expect(200);
    const results = await runWorkers();

    expect(Object.values(results)).toEqual(["processed", "processed", "processed"]);
    expect(refund).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]![0].params.tickets_html).toContain("Projector failure");
    const [day] = await prisma.dailySales.findMany();
    expect(day).toMatchObject({ orders: 1, refunds: (await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).amount });
  });

  it("refunds a payment that arrives after the showtime was cancelled", async () => {
    const auth = await admin();
    const { showtime, seats } = await createFixture();
    const { token } = await createUser();
    await lock(token, showtime.id, [seats[0]!.id]).expect(201);
    const orderId = (await startCheckout(token, showtime.id).expect(202)).body.order.id;
    await api().post(`/api/admin/showtimes/${showtime.id}/cancel`).set(auth).send({ reason: "Flood" }).expect(200);
    const refund = vi.spyOn(paymentProvider, "refund");

    const late = await deliverPaymentEvent(orderId).expect(200);
    expect(late.body.result).toBe("already-settled");
    expect(refund).toHaveBeenCalledOnce();
    expect(await prisma.ticket.count()).toBe(0);
  });
});

describe("refunding an order", () => {
  it("refunds a paid order once and frees its seats", async () => {
    const auth = await admin();
    const { showtime, seats } = await createFixture();
    const { order } = await paidOrder(showtime.id, seats[0]!.id);

    await api().post(`/api/admin/orders/${order.id}/refund`).set(auth).send({ reason: "Customer request" }).expect(204);
    const again = await api().post(`/api/admin/orders/${order.id}/refund`).set(auth).send({ reason: "Customer request" }).expect(409);
    expect(again.body.error.code).toBe("NOT_REFUNDABLE");

    const map = await api().get(`/api/showtimes/${showtime.id}/seats`);
    expect(map.body.seats[0].state).toBe("free");
    const found = await api().get("/api/admin/orders").query({ q: "buyer@test" }).set(auth).expect(200);
    expect(found.body.orders[0]).toMatchObject({ id: order.id, status: "REFUNDED", refundReason: "Customer request" });
  });

  it("does not refund an order whose ticket was used, even when the scan and refund race", async () => {
    const auth = await admin();
    const { showtime, seats } = await createFixture();
    const staff = await createUser("STAFF");
    const { order } = await paidOrder(showtime.id, seats[0]!.id);

    const [scan, refund] = await Promise.all([
      api().post("/api/tickets/verify").set(bearer(staff.token)).send({ qrToken: order.tickets[0]!.qrToken }),
      api().post(`/api/admin/orders/${order.id}/refund`).set(auth).send({ reason: "Race" }),
    ]);
    const final = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { tickets: true } });
    // Exactly one wins: admitted and not refunded, or refunded and turned away at the door.
    if (scan.status === 200) {
      expect(refund.status).toBe(409);
      expect(refund.body.error.code).toBe("ORDER_USED");
      expect(final).toMatchObject({ status: "PAID", tickets: [expect.objectContaining({ status: "USED" })] });
    } else {
      expect(refund.status).toBe(204);
      expect(final).toMatchObject({ status: "REFUNDED", tickets: [expect.objectContaining({ status: "CANCELLED" })] });
    }
  });
});

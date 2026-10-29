import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db.js";
import { showtimeHolds } from "../src/holds/seat-holds.js";
import { mailer } from "../src/notifications/index.js";
import { api, checkout, createFixture, createUser, guestToken, lock, runWorkers } from "./helpers.js";

/** A box-office sale through the whole flow: cash settles at once, a card through the webhook. */
const kioskCheckout = (token: string, showtimeId: string, extra: Record<string, unknown> = {}) =>
  checkout(token, showtimeId, extra, { path: "/api/checkout/kiosk" });

describe("box-office sales", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lets staff hold seats and sell them for cash without an email", async () => {
    const { showtime, seats } = await createFixture();
    const { token } = await createUser("STAFF");
    const send = vi.spyOn(mailer, "send");
    await lock(token, showtime.id, [seats[0]!.id, seats[1]!.id]).expect(201);

    const res = await kioskCheckout(token, showtime.id, { payment: "CASH" }).expect(201);
    expect(res.body.order).toMatchObject({ status: "PAID", amount: 2000, contactEmail: null, paymentMethod: "CASH" });
    expect(send).not.toHaveBeenCalled();

    const tickets = await prisma.ticket.findMany({ where: { orderId: res.body.order.id } });
    expect(tickets).toHaveLength(2);
    // Walk-in tickets are KIOSK sales and belong to no account, not to the staff member.
    expect(tickets.every((ticket) => ticket.channel === "KIOSK" && ticket.userId === null)).toBe(true);

    const page = await api().get(`/api/orders/${res.body.order.accessToken}`).expect(200);
    expect(page.body.order.email).toBeNull();
  });

  it("charges the card and emails the tickets when an address is given", async () => {
    const { showtime, seats } = await createFixture();
    const { token } = await createUser("ADMIN");
    const send = vi.spyOn(mailer, "send");
    await lock(token, showtime.id, [seats[0]!.id]).expect(201);

    const res = await kioskCheckout(token, showtime.id, { email: "walk-in@test.local" }).expect(201);
    expect(res.body.order).toMatchObject({ paymentMethod: "CARD", contactEmail: "walk-in@test.local" });
    // The email goes out from the worker, after the sale.
    expect(send).not.toHaveBeenCalled();
    await runWorkers();
    expect(send).toHaveBeenCalledOnce();
  });

  it("keeps the seats when the card is declined", async () => {
    const { showtime, seats } = await createFixture();
    const { token } = await createUser("STAFF");
    await lock(token, showtime.id, [seats[0]!.id]).expect(201);

    const res = await kioskCheckout(token, showtime.id, { simulate: "decline" }).expect(402);
    expect(res.body.error.code).toBe("PAYMENT_DECLINED");
    expect(await showtimeHolds(showtime.id)).toHaveLength(1);
  });

  it("is for staff only", async () => {
    const { showtime, seats } = await createFixture();
    const customer = await createUser("CUSTOMER");
    await lock(customer.token, showtime.id, [seats[0]!.id]).expect(201);
    expect((await kioskCheckout(customer.token, showtime.id).expect(403)).body.error.code).toBe("FORBIDDEN");

    const guest = await guestToken("KIOSK");
    await kioskCheckout(guest, showtime.id).expect(403);
    await kioskCheckout("not-a-token", showtime.id).expect(401);
  });
});

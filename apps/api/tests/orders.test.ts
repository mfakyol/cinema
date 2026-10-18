import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db.js";
import { mailer } from "../src/notifications/index.js";
import { api, checkout, createFixture, guestToken, lock } from "./helpers.js";

// Expected Turkish copy comes from the translation file, not from literals here.
const tr = createRequire(import.meta.url)("@sinema/shared/messages/tr.json");

async function buy(extra: Record<string, unknown> = {}) {
  const { showtime, seats } = await createFixture();
  const token = await guestToken("WEB");
  await lock(token, showtime.id, [seats[0]!.id, seats[1]!.id]).expect(201);
  return { token, showtime, res: await checkout(token, showtime.id, extra) };
}

describe("ticket emails and order links", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requires an email to check out", async () => {
    const { showtime, seats } = await createFixture();
    const token = await guestToken("WEB");
    await lock(token, showtime.id, [seats[0]!.id]).expect(201);
    const res = await checkout(token, showtime.id, { email: "not-an-email" }).expect(400);
    expect(res.body.error.code).toBe("VALIDATION");
  });

  it("emails the QR codes and the order link once, in the buyer's language", async () => {
    const send = vi.spyOn(mailer, "send");
    const idempotencyKey = randomUUID();
    const { token, showtime, res } = await buy({ email: "Jane@Example.com", locale: "tr", idempotencyKey });
    expect(res.status).toBe(201);
    const { order } = res.body;

    expect(send).toHaveBeenCalledTimes(1);
    const email = send.mock.calls[0]![0];
    expect(email.to).toBe("jane@example.com");
    expect(email.subject).toBe(tr.email.subject.replace("{movie}", "Test Movie"));
    expect(email.params.order_link).toBe(`http://localhost:3000/orders/${order.accessToken}`);
    expect(email.params.tickets_html).toContain(
      tr.seats.seatLabel.replace("{row}", "A").replace("{number}", "1"),
    );
    for (const ticket of order.tickets) {
      expect(email.params.tickets_html).toContain(`/api/tickets/${ticket.qrToken}/qr.png`);
    }

    // A retry returns the same order without emailing again.
    await checkout(token, showtime.id, { idempotencyKey }).expect(201);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("still completes the sale when the email cannot be sent", async () => {
    vi.spyOn(mailer, "send").mockRejectedValue(new Error("EmailJS is down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { res } = await buy();
    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe("PAID");
  });

  it("shows the order behind the link without signing in", async () => {
    const { res } = await buy({ email: "jane@example.com" });
    expect(res.status).toBe(201);
    const { order } = res.body;

    const page = await api().get(`/api/orders/${order.accessToken}`).expect(200);
    expect(page.body.order.email).toBe("ja***@example.com");
    expect(page.body.order.tickets).toHaveLength(2);
    expect(page.body.order.tickets[0]).toMatchObject({
      status: "PAID",
      seat: { row: "A", number: 1 },
      showtime: { movie: { title: "Test Movie" } },
    });
  });

  it("does not show unknown or unpaid orders", async () => {
    await api().get("/api/orders/not-a-real-token").expect(404);
    const { res } = await buy({ simulate: "decline" });
    expect(res.status).toBe(402);
    const failed = await prisma.order.findFirstOrThrow();
    await api().get(`/api/orders/${failed.accessToken}`).expect(404);
  });

  it("serves each ticket's QR code as an image", async () => {
    const { res } = await buy();
    expect(res.status).toBe(201);
    const { qrToken } = res.body.order.tickets[0];

    const image = await api().get(`/api/tickets/${qrToken}/qr.png`).expect(200);
    expect(image.headers["content-type"]).toBe("image/png");
    expect(image.body.subarray(1, 4).toString()).toBe("PNG");

    const [body] = qrToken.split(".");
    await api().get(`/api/tickets/${body}.forged-signature-00000/qr.png`).expect(404);
  });
});

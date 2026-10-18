import { ticketUrl } from "@sinema/shared";
import { describe, expect, it } from "vitest";
import { api, bearer, checkout, createFixture, createUser, lock } from "./helpers.js";

async function buyTicket() {
  const { showtime, seats } = await createFixture();
  const { token } = await createUser();
  await lock(token, showtime.id, [seats[0]!.id]).expect(201);
  const res = await checkout(token, showtime.id).expect(201);
  return { qrToken: res.body.order.tickets[0].qrToken as string, customerToken: token };
}

const verify = (token: string, qrToken: string) =>
  api().post("/api/tickets/verify").set(bearer(token)).send({ qrToken });

describe("ticket verification", () => {
  it("admits a paid ticket once", async () => {
    const { qrToken } = await buyTicket();
    const staff = await createUser("STAFF");

    const res = await verify(staff.token, qrToken).expect(200);
    expect(res.body.ticket).toMatchObject({ status: "USED", seat: { row: "A", number: 1 } });

    const again = await verify(staff.token, qrToken).expect(409);
    expect(again.body.error.code).toBe("ALREADY_USED");
  });

  it("admits a ticket from the link its QR code holds", async () => {
    const { qrToken } = await buyTicket();
    const staff = await createUser("STAFF");

    const res = await verify(staff.token, ticketUrl("http://localhost:3000", qrToken)).expect(200);
    expect(res.body.ticket.status).toBe("USED");
  });

  it("opens a ticket by its link without signing in", async () => {
    const { qrToken } = await buyTicket();
    const res = await api().get(`/api/tickets/${qrToken}`).expect(200);
    expect(res.body.ticket).toMatchObject({
      qrToken,
      status: "PAID",
      seat: { row: "A", number: 1 },
      showtime: { movie: { title: "Test Movie" } },
    });

    const [body] = qrToken.split(".");
    await api().get(`/api/tickets/${body}.forged-signature-00000`).expect(404);
  });

  it("admits a ticket only once when two scanners race", async () => {
    const { qrToken } = await buyTicket();
    const staff = await createUser("STAFF");

    const results = await Promise.all([verify(staff.token, qrToken), verify(staff.token, qrToken)]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
  });

  it("rejects a forged code before looking it up", async () => {
    const { qrToken } = await buyTicket();
    const staff = await createUser("STAFF");
    const [body] = qrToken.split(".");

    const res = await verify(staff.token, `${body}.forged-signature-00000`).expect(400);
    expect(res.body.error.code).toBe("INVALID_QR");
  });

  it("is only open to staff and admins", async () => {
    const { qrToken, customerToken } = await buyTicket();
    await verify(customerToken, qrToken).expect(403);
    const admin = await createUser("ADMIN");
    await verify(admin.token, qrToken).expect(200);
  });
});

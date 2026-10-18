import { concessionUrl, ticketUrl } from "@sinema/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db.js";
import { mailer } from "../src/notifications/index.js";
import { api, bearer, checkout, createFixture, createUser, guestToken, lock } from "./helpers.js";

const SITE = "http://localhost:3000";

async function createProducts() {
  const create = (category: "COMBO" | "SNACK" | "DRINK" | "GLASSES", price: number, en: string, sortOrder: number) =>
    prisma.product.create({ data: { category, price, sortOrder, name: { en, tr: `${en} (tr)` } } });
  return {
    glasses: await create("GLASSES", 400, "3D glasses", 0),
    popcorn: await create("SNACK", 900, "Popcorn", 1),
    drink: await create("DRINK", 700, "Soft drink", 2),
    retired: await prisma.product.create({
      data: { category: "SNACK", price: 100, name: { en: "Old snack", tr: "Old snack" }, active: false },
    }),
  };
}

/** A 3D showtime, two locked seats and a guest ready to check out. */
async function readyToBuy(format: "TWO_D" | "THREE_D" = "THREE_D") {
  const fixture = await createFixture();
  await prisma.showtime.update({ where: { id: fixture.showtime.id }, data: { format } });
  const products = await createProducts();
  const token = await guestToken("WEB");
  await lock(token, fixture.showtime.id, [fixture.seats[0]!.id, fixture.seats[1]!.id]).expect(201);
  return { ...fixture, products, token };
}

const collect = (token: string, qrToken: string) =>
  api().post("/api/concessions/collect").set(bearer(token)).send({ qrToken });
const admit = (token: string, qrToken: string) =>
  api().post("/api/tickets/verify").set(bearer(token)).send({ qrToken });

describe("concessions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists 3D glasses only for 3D showtimes, and never retired products", async () => {
    const { showtime, products } = await readyToBuy("THREE_D");
    const threeD = await api().get(`/api/products?showtimeId=${showtime.id}`).expect(200);
    expect(threeD.body.products.map((p: { id: string }) => p.id)).toEqual([
      products.glasses.id,
      products.popcorn.id,
      products.drink.id,
    ]);
    expect(threeD.body.products[0].name).toEqual({ en: "3D glasses", tr: "3D glasses (tr)" });

    await prisma.showtime.update({ where: { id: showtime.id }, data: { format: "TWO_D" } });
    const twoD = await api().get(`/api/products?showtimeId=${showtime.id}`).expect(200);
    expect(twoD.body.products.map((p: { category: string }) => p.category)).not.toContain("GLASSES");

    await api().get("/api/products?showtimeId=does-not-exist").expect(404);
  });

  it("sells items with the tickets, one voucher per unit, and charges for them", async () => {
    const { showtime, products, token } = await readyToBuy();
    const res = await checkout(token, showtime.id, {
      items: [
        { productId: products.popcorn.id, quantity: 2 },
        { productId: products.glasses.id, quantity: 2 },
        { productId: products.popcorn.id, quantity: 1 },
      ],
    }).expect(201);

    // Two seats at 10.00, three popcorns at 9.00 and two glasses at 4.00.
    expect(res.body.order.amount).toBe(2 * 1000 + 3 * 900 + 2 * 400);
    const lines = new Map(res.body.order.items.map((i: { productId: string }) => [i.productId, i]));
    expect(lines.get(products.popcorn.id)).toMatchObject({ quantity: 3, unitPrice: 900 });
    expect((lines.get(products.popcorn.id) as { vouchers: unknown[] }).vouchers).toHaveLength(3);
    expect((lines.get(products.glasses.id) as { vouchers: unknown[] }).vouchers).toHaveLength(2);

    const mine = await api().get("/api/me/concessions").set(bearer(token)).expect(200);
    expect(mine.body.vouchers).toHaveLength(5);
    expect(mine.body.vouchers[0]).toMatchObject({ status: "PAID", showtime: { id: showtime.id } });
  });

  it("refuses 3D glasses for a 2D showtime and products that are not on sale", async () => {
    const { showtime, products, token } = await readyToBuy("TWO_D");
    const glasses = await checkout(token, showtime.id, {
      items: [{ productId: products.glasses.id, quantity: 1 }],
    }).expect(400);
    expect(glasses.body.error.code).toBe("GLASSES_NOT_3D");

    const retired = await checkout(token, showtime.id, {
      items: [{ productId: products.retired.id, quantity: 1 }],
    }).expect(400);
    expect(retired.body.error.code).toBe("INVALID_PRODUCT");
    expect(await prisma.order.count()).toBe(0);
  });

  it("hands each item over once at the stand", async () => {
    const { showtime, products, token } = await readyToBuy();
    const res = await checkout(token, showtime.id, {
      items: [{ productId: products.popcorn.id, quantity: 1 }],
    }).expect(201);
    const { qrToken } = res.body.order.items[0].vouchers[0];
    const staff = await createUser("STAFF");

    const first = await collect(staff.token, concessionUrl(SITE, qrToken)).expect(200);
    expect(first.body.voucher).toMatchObject({
      status: "USED",
      product: { category: "SNACK", name: { en: "Popcorn" } },
      showtime: { id: showtime.id },
    });
    const again = await collect(staff.token, concessionUrl(SITE, qrToken)).expect(409);
    expect(again.body.error.code).toBe("ALREADY_COLLECTED");

    const customer = await createUser();
    await collect(customer.token, qrToken).expect(403);
  });

  it("keeps the door and the stand from using up each other's codes", async () => {
    const { showtime, products, token } = await readyToBuy();
    const res = await checkout(token, showtime.id, {
      items: [{ productId: products.drink.id, quantity: 1 }],
    }).expect(201);
    const ticketCode = res.body.order.tickets[0].qrToken;
    const voucherCode = res.body.order.items[0].vouchers[0].qrToken;
    const staff = await createUser("STAFF");

    const ticketAtStand = await collect(staff.token, ticketUrl(SITE, ticketCode)).expect(400);
    expect(ticketAtStand.body.error.code).toBe("WRONG_KIND_TICKET");
    const bareTicketAtStand = await collect(staff.token, ticketCode).expect(400);
    expect(bareTicketAtStand.body.error.code).toBe("WRONG_KIND_TICKET");
    const voucherAtDoor = await admit(staff.token, concessionUrl(SITE, voucherCode)).expect(400);
    expect(voucherAtDoor.body.error.code).toBe("WRONG_KIND_CONCESSION");

    // Both still work where they belong.
    await admit(staff.token, ticketUrl(SITE, ticketCode)).expect(200);
    await collect(staff.token, concessionUrl(SITE, voucherCode)).expect(200);
  });

  it("opens an item by its link and lists items on the order page", async () => {
    const { showtime, products, token } = await readyToBuy();
    const res = await checkout(token, showtime.id, {
      items: [{ productId: products.glasses.id, quantity: 2 }],
    }).expect(201);
    const { qrToken } = res.body.order.items[0].vouchers[0];

    const item = await api().get(`/api/concessions/${qrToken}`).expect(200);
    expect(item.body.voucher).toMatchObject({ status: "PAID", product: { category: "GLASSES" } });
    const [body] = qrToken.split(".");
    await api().get(`/api/concessions/${body}.forged-signature-00000`).expect(404);

    const image = await api().get(`/api/concessions/${qrToken}/qr.png`).expect(200);
    expect(image.headers["content-type"]).toBe("image/png");

    const page = await api().get(`/api/orders/${res.body.order.accessToken}`).expect(200);
    expect(page.body.order.vouchers).toHaveLength(2);
  });

  it("puts every item's QR code in the confirmation email", async () => {
    const send = vi.spyOn(mailer, "send");
    const { showtime, products, token } = await readyToBuy();
    const res = await checkout(token, showtime.id, {
      items: [{ productId: products.popcorn.id, quantity: 2 }],
    }).expect(201);

    const html = send.mock.calls[0]![0].params.tickets_html!;
    for (const voucher of res.body.order.items[0].vouchers) {
      expect(html).toContain(`/api/concessions/${voucher.qrToken}/qr.png`);
    }
    expect(html).toContain("Popcorn");
  });
});

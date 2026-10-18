import { applyDiscount, discountFor } from "@sinema/shared";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { api, checkout, createFixture, createUser, lock, nextSaturdayEvening } from "./helpers.js";

/** A UTC instant; Istanbul is UTC+3 all year. */
const at = (iso: string) => new Date(iso);

describe("automatic discounts", () => {
  it("gives 50% off on any Wednesday showtime", () => {
    expect(discountFor(at("2026-10-21T17:00:00Z"))).toEqual({ kind: "PEOPLES_DAY", percent: 50 });
    expect(discountFor(at("2026-10-21T06:00:00Z"))).toEqual({ kind: "PEOPLES_DAY", percent: 50 });
  });

  it("judges the day in cinema time, not UTC", () => {
    // Tuesday 22:30 UTC is already Wednesday 01:30 in Istanbul.
    expect(discountFor(at("2026-10-20T22:30:00Z"))?.kind).toBe("PEOPLES_DAY");
  });

  it("gives 15% off on other weekdays before 17:00", () => {
    expect(discountFor(at("2026-10-19T08:00:00Z"))).toEqual({ kind: "DAYTIME", percent: 15 }); // Mon 11:00
    expect(discountFor(at("2026-10-23T13:59:00Z"))?.kind).toBe("DAYTIME"); // Fri 16:59
    expect(discountFor(at("2026-10-19T14:00:00Z"))).toBeNull(); // Mon 17:00
  });

  it("gives nothing at weekends", () => {
    expect(discountFor(at("2026-10-24T08:00:00Z"))).toBeNull(); // Sat 11:00
    expect(discountFor(at("2026-10-25T17:00:00Z"))).toBeNull(); // Sun 20:00
    expect(discountFor(nextSaturdayEvening())).toBeNull();
  });

  it("rounds discounted prices to whole cents", () => {
    expect(applyDiscount(25000, { kind: "DAYTIME", percent: 15 })).toBe(21250);
    expect(applyDiscount(999, { kind: "PEOPLES_DAY", percent: 50 })).toBe(500);
    expect(applyDiscount(25000, null)).toBe(25000);
  });

  it("flags showtimes and charges the discounted price", async () => {
    const { movie, showtime, seats } = await createFixture();
    // Move the showtime to the Wednesday after next, 20:00 cinema time.
    const wednesday = nextSaturdayEvening();
    wednesday.setUTCDate(wednesday.getUTCDate() + 4);
    await prisma.showtime.update({ where: { id: showtime.id }, data: { startsAt: wednesday } });

    const list = await api().get(`/api/movies/${movie.id}/showtimes`).expect(200);
    expect(list.body.showtimes[0]).toMatchObject({
      basePrice: 1000,
      price: 500,
      discount: { kind: "PEOPLES_DAY", percent: 50 },
    });
    const map = await api().get(`/api/showtimes/${showtime.id}/seats`).expect(200);
    expect(map.body.showtime).toMatchObject({ price: 500, basePrice: 1000 });

    const { token } = await createUser();
    await lock(token, showtime.id, [seats[0]!.id, seats[1]!.id]).expect(201);
    const res = await checkout(token, showtime.id).expect(201);
    expect(res.body.order.amount).toBe(1000);
  });
});

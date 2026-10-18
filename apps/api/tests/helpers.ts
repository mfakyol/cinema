import { randomUUID } from "node:crypto";
import request from "supertest";
import type { Role } from "@sinema/shared";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { signToken } from "../src/lib/jwt.js";

const app = createApp();

export const api = () => request(app);

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Next Saturday at 20:00 cinema time (17:00 UTC), at least a day away: no automatic discount
 * applies on a Saturday evening, so prices in tests do not depend on the day they run.
 */
export function nextSaturdayEvening(): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 2);
  while (date.getUTCDay() !== 6) date.setUTCDate(date.getUTCDate() + 1);
  date.setUTCHours(17, 0, 0, 0);
  return date;
}

/** A movie, a 2x6 hall and one showtime next Saturday evening at 10.00 a seat. */
export async function createFixture() {
  const movie = await prisma.movie.create({
    data: { title: "Test Movie", description: "A movie for tests.", durationMin: 100, genre: "Drama" },
  });
  const hall = await prisma.hall.create({
    data: {
      name: `Hall ${randomUUID()}`,
      seats: {
        create: ["A", "B"].flatMap((row) =>
          Array.from({ length: 6 }, (_, i) => ({ row, number: i + 1, column: i })),
        ),
      },
    },
    include: { seats: { orderBy: [{ row: "asc" }, { number: "asc" }] } },
  });
  const showtime = await prisma.showtime.create({
    data: {
      movieId: movie.id,
      hallId: hall.id,
      startsAt: nextSaturdayEvening(),
      price: 1000,
    },
  });
  return { movie, hall, seats: hall.seats, showtime };
}

export async function createUser(role: Role = "CUSTOMER") {
  const user = await prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${randomUUID()}@test.local`,
      name: role,
      role,
      passwordHash: "unused",
    },
  });
  return { user, token: signToken({ sub: user.id, role }) };
}

export async function guestToken(channel?: "WEB" | "MOBILE" | "KIOSK"): Promise<string> {
  const res = await api().post("/api/auth/guest").send(channel ? { channel } : {}).expect(201);
  return res.body.token;
}

export function lock(token: string, showtimeId: string, seatIds: string[]) {
  return api().post(`/api/showtimes/${showtimeId}/locks`).set(bearer(token)).send({ seatIds });
}

export function checkout(
  token: string,
  showtimeId: string,
  extra: Record<string, unknown> = {},
) {
  return api()
    .post("/api/checkout")
    .set(bearer(token))
    .send({ showtimeId, idempotencyKey: randomUUID(), email: "buyer@test.local", ...extra });
}

import { randomUUID } from "node:crypto";
import request from "supertest";
import type { Role } from "@sinema/shared";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { signToken } from "../src/lib/jwt.js";

const app = createApp();

export const api = () => request(app);

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const DAY_MS = 24 * 60 * 60 * 1000;

/** A movie, a 2x6 hall and one showtime tomorrow at 10.00 a seat. */
export async function createFixture() {
  const movie = await prisma.movie.create({
    data: { title: "Test Movie", description: "A movie for tests.", durationMin: 100, genre: "Drama" },
  });
  const hall = await prisma.hall.create({
    data: {
      name: `Hall ${randomUUID()}`,
      seats: {
        create: ["A", "B"].flatMap((row) =>
          Array.from({ length: 6 }, (_, i) => ({ row, number: i + 1 })),
        ),
      },
    },
    include: { seats: { orderBy: [{ row: "asc" }, { number: "asc" }] } },
  });
  const showtime = await prisma.showtime.create({
    data: {
      movieId: movie.id,
      hallId: hall.id,
      startsAt: new Date(Date.now() + DAY_MS),
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

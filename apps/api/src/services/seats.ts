import type { SeatState } from "@sinema/shared";
import { prisma } from "../db.js";
import { HttpError } from "../lib/http-error.js";

export async function getSeatMap(showtimeId: string, holderId?: string) {
  const showtime = await prisma.showtime.findUnique({
    where: { id: showtimeId },
    include: {
      movie: { select: { id: true, title: true, durationMin: true } },
      hall: {
        select: {
          id: true,
          name: true,
          seats: { orderBy: [{ row: "asc" }, { number: "asc" }] },
        },
      },
    },
  });
  if (!showtime) throw new HttpError(404, "NOT_FOUND", "Showtime not found");

  const now = new Date();
  const [locks, tickets] = await Promise.all([
    prisma.seatLock.findMany({
      where: { showtimeId, expiresAt: { gt: now } },
      select: { id: true, seatId: true, holderId: true, expiresAt: true },
    }),
    prisma.ticket.findMany({
      where: { showtimeId, status: { not: "CANCELLED" } },
      select: { seatId: true },
    }),
  ]);
  const lockBySeat = new Map(locks.map((lock) => [lock.seatId, lock]));
  const soldSeats = new Set(tickets.map((ticket) => ticket.seatId));

  return {
    showtime: {
      id: showtime.id,
      startsAt: showtime.startsAt,
      price: showtime.price,
      movie: showtime.movie,
      hall: { id: showtime.hall.id, name: showtime.hall.name },
    },
    seats: showtime.hall.seats.map((seat) => {
      const lock = lockBySeat.get(seat.id);
      const state: SeatState = soldSeats.has(seat.id) ? "sold" : lock ? "locked" : "free";
      const mine = state === "locked" && holderId !== undefined && lock?.holderId === holderId;
      return {
        id: seat.id,
        row: seat.row,
        number: seat.number,
        type: seat.type,
        state,
        // Only the holder sees their own lock id and expiry, to release or count down.
        ...(mine && lock ? { lockId: lock.id, lockExpiresAt: lock.expiresAt } : {}),
      };
    }),
  };
}

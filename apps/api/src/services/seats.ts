import { type SeatState, seatPricing } from "@sinema/shared";
import { prisma } from "../db.js";
import { holdId, showtimeHolds } from "../holds/seat-holds.js";
import { cached } from "../infra/cache.js";
import { HttpError } from "../lib/http-error.js";

/** How long the hall layout and sold seats of a showtime stay cached; sales invalidate sooner. */
const SEAT_MAP_TTL_SECONDS = 300;

/** The part of a seat map every viewer shares: the showtime, the hall's seats and the sold ones. */
async function loadSeatMapBase(showtimeId: string) {
  const showtime = await prisma.showtime.findUnique({
    where: { id: showtimeId },
    include: {
      movie: { select: { id: true, title: true, durationMin: true } },
      hall: {
        select: {
          id: true,
          name: true,
          seats: { orderBy: [{ row: "asc" }, { column: "asc" }] },
        },
      },
    },
  });
  if (!showtime) return null;
  const tickets = await prisma.ticket.findMany({
    where: { showtimeId, status: { not: "CANCELLED" } },
    select: { seatId: true },
  });
  return {
    showtime: {
      id: showtime.id,
      startsAt: showtime.startsAt.toISOString(),
      price: showtime.price,
      format: showtime.format,
      movie: showtime.movie,
      hall: { id: showtime.hall.id, name: showtime.hall.name },
    },
    seats: showtime.hall.seats.map(({ id, row, number, column, type }) => ({ id, row, number, column, type })),
    soldSeatIds: tickets.map((ticket) => ticket.seatId),
  };
}

/**
 * A showtime's seat map: the cached base from PostgreSQL with the live holds from Redis laid
 * over it, so holds never make the cache stale. Only the holder sees their own hold ids and
 * expiry, to release them or count down.
 */
export async function getSeatMap(showtimeId: string, holderId?: string) {
  const base = await cached(`seatmap:${showtimeId}`, showtimeId, SEAT_MAP_TTL_SECONDS, () =>
    loadSeatMapBase(showtimeId),
  );
  if (!base) throw new HttpError(404, "NOT_FOUND", "Showtime not found");

  const holds = new Map((await showtimeHolds(showtimeId)).map((hold) => [hold.seatId, hold]));
  const sold = new Set(base.soldSeatIds);
  const { showtime } = base;

  return {
    showtime: {
      id: showtime.id,
      startsAt: showtime.startsAt,
      ...seatPricing({ price: showtime.price, startsAt: new Date(showtime.startsAt) }),
      format: showtime.format,
      movie: showtime.movie,
      hall: showtime.hall,
    },
    columns: Math.max(0, ...base.seats.map((seat) => seat.column + 1)),
    seats: base.seats.map((seat) => {
      const hold = holds.get(seat.id);
      const state: SeatState = sold.has(seat.id) ? "sold" : hold ? "locked" : "free";
      const mine = state === "locked" && holderId !== undefined && hold?.holderId === holderId;
      return {
        ...seat,
        state,
        ...(mine && hold ? { lockId: holdId(showtimeId, seat.id), lockExpiresAt: hold.expiresAt } : {}),
      };
    }),
  };
}

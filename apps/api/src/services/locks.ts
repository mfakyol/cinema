import { groupBy, MAX_LOCKS_PER_HOLDER, SocketEvent } from "@sinema/shared";
import { prisma } from "../db.js";
import { heldBy, holdId, holdSeats, parseHoldId, releaseHolds } from "../holds/seat-holds.js";
import { HttpError } from "../lib/http-error.js";
import { emitToShowtime } from "../realtime.js";

/**
 * Holds seats for a holder for 10 minutes (see holds/seat-holds.ts). Checks here only give
 * clearer errors; the hold itself is one atomic Redis step that either takes every seat or none.
 *
 * A holder buys for one showtime at a time: holding seats in a showtime releases whatever they
 * still hold in any other, so seats left behind when switching showtimes free up at once.
 */
export async function lockSeats(holderId: string, showtimeId: string, seatIds: string[]) {
  const showtime = await prisma.showtime.findUnique({ where: { id: showtimeId } });
  if (!showtime) throw new HttpError(404, "NOT_FOUND", "Showtime not found");
  if (showtime.cancelledAt) throw new HttpError(409, "SHOWTIME_CANCELLED", "This showtime was cancelled");
  if (showtime.startsAt <= new Date()) {
    throw new HttpError(409, "SHOWTIME_STARTED", "This showtime has already started");
  }

  const ids = [...new Set(seatIds)];
  const seatCount = await prisma.seat.count({ where: { id: { in: ids }, hallId: showtime.hallId } });
  if (seatCount !== ids.length) {
    throw new HttpError(400, "INVALID_SEAT", "Some seats are not in this showtime's hall");
  }
  const sold = await prisma.ticket.count({
    where: { showtimeId, seatId: { in: ids }, status: { not: "CANCELLED" } },
  });
  if (sold > 0) throw new HttpError(409, "SEAT_TAKEN", "Some seats are already sold");

  const result = await holdSeats(holderId, showtimeId, ids);
  if (!result.ok) {
    throw result.reason === "TAKEN"
      ? new HttpError(409, "SEAT_TAKEN", "Some seats are already held by someone else")
      : new HttpError(409, "LOCK_LIMIT", `You can hold at most ${MAX_LOCKS_PER_HOLDER} seats at a time`);
  }

  for (const [otherShowtimeId, released] of groupBy(result.released, (hold) => hold.showtimeId)) {
    emitToShowtime(otherShowtimeId, SocketEvent.SEAT_RELEASED, { seatIds: released.map((hold) => hold.seatId) });
  }
  emitToShowtime(showtimeId, SocketEvent.SEAT_LOCKED, { seatIds: ids, expiresAt: result.expiresAt });

  const mine = await heldBy(holderId, showtimeId);
  return mine
    .filter((hold) => ids.includes(hold.seatId))
    .map((hold) => ({ id: holdId(showtimeId, hold.seatId), seatId: hold.seatId, expiresAt: hold.expiresAt }));
}

/** Releases one hold by its id; someone else's hold looks the same as a missing one. */
export async function releaseLock(holderId: string, lockId: string) {
  const parsed = parseHoldId(lockId);
  const released = parsed ? await releaseHolds(holderId, parsed.showtimeId, [parsed.seatId]) : [];
  if (!parsed || released.length === 0) throw new HttpError(404, "NOT_FOUND", "Lock not found");
  emitToShowtime(parsed.showtimeId, SocketEvent.SEAT_RELEASED, { seatIds: released });
}

import { MAX_LOCKS_PER_HOLDER, SEAT_LOCK_TTL_MS, SocketEvent } from "@sinema/shared";
import { isUniqueViolation, prisma } from "../db.js";
import { HttpError } from "../lib/http-error.js";
import { emitToShowtime } from "../realtime.js";

/**
 * Locks seats for a holder. The unique (showtimeId, seatId) constraint on SeatLock is what
 * stops two holders from winning the same seat; the checks before it only give clearer errors.
 */
export async function lockSeats(holderId: string, showtimeId: string, seatIds: string[]) {
  const now = new Date();
  const showtime = await prisma.showtime.findUnique({ where: { id: showtimeId } });
  if (!showtime) throw new HttpError(404, "NOT_FOUND", "Showtime not found");
  if (showtime.startsAt <= now) {
    throw new HttpError(409, "SHOWTIME_STARTED", "This showtime has already started");
  }

  const ids = [...new Set(seatIds)];
  const seatCount = await prisma.seat.count({ where: { id: { in: ids }, hallId: showtime.hallId } });
  if (seatCount !== ids.length) {
    throw new HttpError(400, "INVALID_SEAT", "Some seats are not in this showtime's hall");
  }

  const expiresAt = new Date(now.getTime() + SEAT_LOCK_TTL_MS);
  let locks;
  try {
    locks = await prisma.$transaction(async (tx) => {
      // Expired locks no longer hold their seat; clear them so the insert below can claim it.
      await tx.seatLock.deleteMany({
        where: { showtimeId, seatId: { in: ids }, expiresAt: { lte: now } },
      });

      const sold = await tx.ticket.count({
        where: { showtimeId, seatId: { in: ids }, status: { not: "CANCELLED" } },
      });
      if (sold > 0) throw new HttpError(409, "SEAT_TAKEN", "Some seats are already sold");

      const held = await tx.seatLock.count({ where: { holderId, expiresAt: { gt: now } } });
      if (held + ids.length > MAX_LOCKS_PER_HOLDER) {
        throw new HttpError(
          409,
          "LOCK_LIMIT",
          `You can hold at most ${MAX_LOCKS_PER_HOLDER} seats at a time`,
        );
      }

      const created = [];
      for (const seatId of ids) {
        created.push(
          await tx.seatLock.create({ data: { showtimeId, seatId, holderId, expiresAt } }),
        );
      }
      return created;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(409, "SEAT_TAKEN", "Some seats are already locked by someone else");
    }
    throw error;
  }

  emitToShowtime(showtimeId, SocketEvent.SEAT_LOCKED, { seatIds: ids, expiresAt });
  return locks.map(({ id, seatId, expiresAt }) => ({ id, seatId, expiresAt }));
}

export async function releaseLock(holderId: string, lockId: string) {
  const lock = await prisma.seatLock.findUnique({ where: { id: lockId } });
  // Someone else's lock looks the same as a missing one, so lock ids reveal nothing.
  if (!lock || lock.holderId !== holderId) {
    throw new HttpError(404, "NOT_FOUND", "Lock not found");
  }
  await prisma.seatLock.delete({ where: { id: lockId } });
  emitToShowtime(lock.showtimeId, SocketEvent.SEAT_RELEASED, { seatIds: [lock.seatId] });
}

/** Deletes expired locks and tells each showtime's room. Runs on an interval in the server. */
export async function releaseExpiredLocks(now = new Date()): Promise<number> {
  const expired = await prisma.seatLock.findMany({
    where: { expiresAt: { lte: now } },
    select: { id: true, showtimeId: true, seatId: true },
  });
  if (expired.length === 0) return 0;

  await prisma.seatLock.deleteMany({
    where: { id: { in: expired.map((lock) => lock.id) }, expiresAt: { lte: now } },
  });

  const seatsByShowtime = Map.groupBy(expired, (lock) => lock.showtimeId);
  for (const [showtimeId, locks] of seatsByShowtime) {
    emitToShowtime(showtimeId, SocketEvent.SEAT_RELEASED, {
      seatIds: locks.map((lock) => lock.seatId),
    });
  }
  return expired.length;
}

import {
  type AdminMovie,
  type AdminOrder,
  type AdminShowtime,
  cinemaTime,
  type MovieInput,
  type ShowtimeBulkInput,
  type ShowtimeCreateInput,
  showtimeEndsAt,
  SocketEvent,
} from "@sinema/shared";
import { prisma } from "../db.js";
import type { Prisma } from "../generated/prisma/client.js";
import { releaseShowtimeHolds } from "../holds/seat-holds.js";
import { invalidate } from "../infra/cache.js";
import { HttpError } from "../lib/http-error.js";
import { emitToShowtime } from "../realtime.js";
import { refundOrderInTx } from "./refunds.js";

/* Movies */

export async function listMovies(): Promise<AdminMovie[]> {
  const now = new Date();
  const movies = await prisma.movie.findMany({
    include: { _count: { select: { showtimes: { where: { startsAt: { gt: now }, cancelledAt: null } } } } },
    orderBy: { title: "asc" },
  });
  return movies.map(({ _count, tmdbId: _tmdbId, ...movie }) => ({ ...movie, upcomingShowtimes: _count.showtimes }));
}

export async function createMovie(input: MovieInput) {
  return prisma.movie.create({ data: input });
}

export async function updateMovie(id: string, input: MovieInput) {
  if (!(await prisma.movie.findUnique({ where: { id } }))) throw new HttpError(404, "NOT_FOUND", "Movie not found");
  const movie = await prisma.movie.update({ where: { id }, data: input });
  // Titles appear in every showtime list and seat map.
  const showtimes = await prisma.showtime.findMany({ where: { movieId: id }, select: { id: true } });
  await invalidate("showtimes", ...showtimes.map((showtime) => `seatmap:${showtime.id}`));
  return movie;
}

/* Showtimes */

const adminShowtimeInclude = {
  movie: { select: { id: true, title: true, durationMin: true } },
  hall: { select: { id: true, name: true, _count: { select: { seats: true } } } },
  _count: { select: { tickets: { where: { status: { not: "CANCELLED" as const } } } } },
};

type ShowtimeRow = Prisma.ShowtimeGetPayload<{ include: typeof adminShowtimeInclude }>;

const toAdminShowtime = (row: ShowtimeRow): AdminShowtime => ({
  id: row.id,
  startsAt: row.startsAt.toISOString(),
  endsAt: showtimeEndsAt(row.startsAt, row.movie.durationMin).toISOString(),
  format: row.format,
  price: row.price,
  movie: row.movie,
  hall: { id: row.hall.id, name: row.hall.name },
  seatCount: row.hall._count.seats,
  sold: row._count.tickets,
  cancelledAt: row.cancelledAt?.toISOString() ?? null,
  cancelReason: row.cancelReason,
});

/** Every showtime in a window, cancelled ones included, for the schedule page. */
export async function listAdminShowtimes(from: Date, to: Date): Promise<AdminShowtime[]> {
  const rows = await prisma.showtime.findMany({
    where: { startsAt: { gte: from, lt: to } },
    include: adminShowtimeInclude,
    orderBy: [{ startsAt: "asc" }, { hall: { name: "asc" } }],
  });
  return rows.map(toAdminShowtime);
}

type Conflict = "PAST" | "FORMAT_NOT_IN_HALL" | "HALL_BUSY";

/**
 * Adds one showtime inside a transaction that holds an advisory lock for the hall, so two
 * admins adding to the same hall at the same moment cannot both pass the overlap check.
 * Returns the reason instead of throwing, so bulk adds can skip and report.
 */
async function addShowtime(input: ShowtimeCreateInput): Promise<{ id: string } | { conflict: Conflict }> {
  if (input.startsAt <= new Date()) return { conflict: "PAST" };
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`hall:${input.hallId}`}))`;
    const [hall, movie] = await Promise.all([
      tx.hall.findUnique({ where: { id: input.hallId } }),
      tx.movie.findUnique({ where: { id: input.movieId } }),
    ]);
    if (!hall) throw new HttpError(404, "NOT_FOUND", "Hall not found");
    if (!movie) throw new HttpError(404, "NOT_FOUND", "Movie not found");
    if (!hall.formats.includes(input.format)) return { conflict: "FORMAT_NOT_IN_HALL" as const };

    // Any showtime in the hall that starts before this one ends and ends after it starts.
    const endsAt = showtimeEndsAt(input.startsAt, movie.durationMin);
    const nearby = await tx.showtime.findMany({
      where: {
        hallId: input.hallId,
        cancelledAt: null,
        startsAt: { lt: endsAt, gt: new Date(input.startsAt.getTime() - 6 * 60 * 60 * 1000) },
      },
      include: { movie: { select: { durationMin: true } } },
    });
    if (nearby.some((other) => showtimeEndsAt(other.startsAt, other.movie.durationMin) > input.startsAt)) {
      return { conflict: "HALL_BUSY" as const };
    }
    const { id } = await tx.showtime.create({ data: input });
    return { id };
  });
}

const conflictError: Record<Conflict, HttpError> = {
  PAST: new HttpError(400, "SHOWTIME_IN_PAST", "A showtime must start in the future"),
  FORMAT_NOT_IN_HALL: new HttpError(400, "FORMAT_NOT_IN_HALL", "This hall cannot show that format"),
  HALL_BUSY: new HttpError(409, "HALL_BUSY", "The hall is busy at that time (film plus turnaround)"),
};

export async function createShowtime(input: ShowtimeCreateInput): Promise<AdminShowtime> {
  const result = await addShowtime(input);
  if ("conflict" in result) throw conflictError[result.conflict];
  await invalidate("showtimes");
  return toAdminShowtime(await prisma.showtime.findUniqueOrThrow({ where: { id: result.id }, include: adminShowtimeInclude }));
}

/** The same times every day from `from` to `to` (cinema dates); clashes are skipped and listed. */
export async function createShowtimesInBulk(input: ShowtimeBulkInput) {
  const created: string[] = [];
  const skipped: { startsAt: string; reason: Conflict }[] = [];
  for (let day = new Date(`${input.from}T00:00:00Z`); day <= new Date(`${input.to}T00:00:00Z`); day.setUTCDate(day.getUTCDate() + 1)) {
    const date = day.toISOString().slice(0, 10);
    for (const time of [...input.times].sort()) {
      const startsAt = cinemaTime(date, time);
      const result = await addShowtime({ movieId: input.movieId, hallId: input.hallId, format: input.format, price: input.price, startsAt });
      if ("conflict" in result) skipped.push({ startsAt: startsAt.toISOString(), reason: result.conflict });
      else created.push(result.id);
    }
  }
  if (created.length > 0) await invalidate("showtimes");
  return { created: created.length, skipped };
}

/**
 * Cancels a showtime that has not started. In one transaction: the showtime is marked, pending
 * orders fail (a payment still on its way is refunded when its webhook arrives), and every paid
 * order is refunded through refundOrderInTx, which queues the money back and the email.
 * Afterwards the seat holds are dropped and every list and seat map refreshed.
 */
export async function cancelShowtime(id: string, reason: string) {
  const showtime = await prisma.showtime.findUnique({ where: { id } });
  if (!showtime) throw new HttpError(404, "NOT_FOUND", "Showtime not found");
  if (showtime.startsAt <= new Date()) throw new HttpError(409, "SHOWTIME_STARTED", "This showtime has already started");

  const result = await prisma.$transaction(
    async (tx) => {
      const { count } = await tx.showtime.updateMany({
        where: { id, cancelledAt: null },
        data: { cancelledAt: new Date(), cancelReason: reason },
      });
      if (count === 0) throw new HttpError(409, "ALREADY_CANCELLED", "This showtime is already cancelled");
      const failed = await tx.order.updateMany({ where: { showtimeId: id, status: "PENDING" }, data: { status: "FAILED" } });
      const paid = await tx.order.findMany({ where: { showtimeId: id, status: "PAID" }, select: { id: true } });
      let refunded = 0;
      for (const order of paid) if (await refundOrderInTx(tx, order.id, reason)) refunded += 1;
      return { refunded, failedPending: failed.count };
    },
    { timeout: 60_000 },
  );

  const released = await releaseShowtimeHolds(id);
  await invalidate("showtimes", `seatmap:${id}`);
  emitToShowtime(id, SocketEvent.SEAT_RELEASED, { seatIds: released });
  return result;
}

/* Orders */

/** Recent orders, or those matching an email or an order id, newest first. */
export async function searchOrders(query: string | undefined): Promise<AdminOrder[]> {
  const q = query?.trim();
  const orders = await prisma.order.findMany({
    where: q
      ? { OR: [{ contactEmail: { contains: q.toLowerCase() } }, ...(/^[0-9a-f-]{36}$/i.test(q) ? [{ id: q }] : [])] }
      : { status: { not: "PENDING" } },
    include: {
      showtime: { select: { id: true, startsAt: true, cancelledAt: true, movie: { select: { title: true } }, hall: { select: { name: true } } } },
      _count: { select: { tickets: true } },
      tickets: { where: { status: "USED" }, select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return orders.map((order) => ({
    id: order.id,
    status: order.status,
    amount: order.amount,
    channel: order.channel,
    paymentMethod: order.paymentMethod,
    contactEmail: order.contactEmail,
    createdAt: order.createdAt.toISOString(),
    refundedAt: order.refundedAt?.toISOString() ?? null,
    refundReason: order.refundReason,
    showtime: {
      id: order.showtime.id,
      startsAt: order.showtime.startsAt.toISOString(),
      movie: order.showtime.movie,
      hall: order.showtime.hall,
      cancelledAt: order.showtime.cancelledAt?.toISOString() ?? null,
    },
    tickets: order._count.tickets,
    usedTickets: order.tickets.length,
  }));
}

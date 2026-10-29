import { seatPricing, type ShowFormat } from "@sinema/shared";
import { prisma } from "../db.js";
import { heldCounts } from "../holds/seat-holds.js";
import { cached } from "../infra/cache.js";

/** Showtime lists change only when a sale happens (or, later, when admins edit the schedule). */
const LIST_TTL_SECONDS = 60;

interface CachedShowtime {
  id: string;
  startsAt: string;
  price: number;
  format: ShowFormat;
  hall: { id: string; name: string };
  movie: { id: string; title: string; durationMin: number; genre: string; posterUrl: string | null };
  seatCount: number;
  soldCount: number;
}

const priced = ({ price, startsAt }: { price: number; startsAt: string }) =>
  seatPricing({ price, startsAt: new Date(startsAt) });

/**
 * Every movie's showtimes between `from` and `to` that have not started yet, with the seats left.
 * The rows and sold counts come from the cache; the held seats are added live from Redis, since
 * holds change far more often than sales.
 */
export async function listShowtimes(from: Date, to: Date) {
  const rows = await cached("showtimes", `range:${from.toISOString()}:${to.toISOString()}`, LIST_TTL_SECONDS, async () => {
    const showtimes = await prisma.showtime.findMany({
      where: { startsAt: { gte: from, lt: to }, cancelledAt: null },
      include: {
        hall: { select: { id: true, name: true, _count: { select: { seats: true } } } },
        movie: { select: { id: true, title: true, durationMin: true, genre: true, posterUrl: true } },
        _count: { select: { tickets: { where: { status: { not: "CANCELLED" } } } } },
      },
      orderBy: [{ startsAt: "asc" }, { hall: { name: "asc" } }],
    });
    return showtimes.map(
      ({ id, startsAt, price, format, hall, movie, _count }): CachedShowtime => ({
        id,
        startsAt: startsAt.toISOString(),
        price,
        format,
        hall: { id: hall.id, name: hall.name },
        movie,
        seatCount: hall._count.seats,
        soldCount: _count.tickets,
      }),
    );
  });

  const now = Date.now();
  const upcoming = rows.filter((row) => new Date(row.startsAt).getTime() > now);
  const held = await heldCounts(upcoming.map((row) => row.id));
  return upcoming.map(({ seatCount, soldCount, price, ...row }) => ({
    ...row,
    seatsLeft: seatCount - soldCount - (held.get(row.id) ?? 0),
    ...priced({ price, startsAt: row.startsAt }),
  }));
}

/** One movie's upcoming showtimes, for the website and the customer app. */
export async function listMovieShowtimes(movieId: string) {
  const rows = await cached("showtimes", `movie:${movieId}`, LIST_TTL_SECONDS, async () => {
    const showtimes = await prisma.showtime.findMany({
      where: { movieId, startsAt: { gt: new Date() }, cancelledAt: null },
      include: { hall: { select: { id: true, name: true } } },
      orderBy: { startsAt: "asc" },
    });
    return showtimes.map(({ id, startsAt, price, format, hall }) => ({
      id,
      startsAt: startsAt.toISOString(),
      price,
      format,
      hall,
    }));
  });
  const now = Date.now();
  return rows
    .filter((row) => new Date(row.startsAt).getTime() > now)
    .map(({ price, ...row }) => ({ ...row, ...priced({ price, startsAt: row.startsAt }) }));
}

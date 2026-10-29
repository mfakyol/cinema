import { z } from "zod";
import { SHOW_FORMATS, type ShowFormat } from "./constants.js";
import { CINEMA_TIME_ZONE } from "./i18n.js";

/** Cleaning and letting people in and out between two showtimes in the same hall. */
export const TURNAROUND_MINUTES = 25;

/** The list price an admin starts from for each format, in cents. */
export const DEFAULT_PRICES: Record<ShowFormat, number> = {
  TWO_D: 25000,
  THREE_D: 30000,
  IMAX: 35000,
  IMAX_3D: 40000,
};

/** When a showtime frees its hall: the film plus the turnaround. */
export const showtimeEndsAt = (startsAt: Date, durationMin: number) =>
  new Date(startsAt.getTime() + (durationMin + TURNAROUND_MINUTES) * 60_000);

/**
 * The instant a cinema-local date and time ("2026-11-04", "20:15") happen, whatever the server's
 * own time zone. The zone's offset is read for that very moment, so it stays right across
 * daylight-saving changes.
 */
export function cinemaTime(date: string, time: string, timeZone = CINEMA_TIME_ZONE): Date {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const [hour, minute] = time.split(":").map(Number) as [number, number];
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(new Date(asUtc));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const shown = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(asUtc - (shown - asUtc));
}

const formatSchema = z.enum(SHOW_FORMATS as [ShowFormat, ...ShowFormat[]]);
const priceSchema = z.number().int().min(0).max(1_000_000);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** A movie as an admin enters it. */
export const movieSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
  durationMin: z.number().int().min(30).max(300),
  genre: z.string().trim().min(1).max(40),
  posterUrl: z.url().nullable().default(null),
});
export type MovieInput = z.infer<typeof movieSchema>;

/** One showtime: the hall must show the format and be free for the film plus the turnaround. */
export const showtimeCreateSchema = z.object({
  movieId: z.uuid(),
  hallId: z.uuid(),
  format: formatSchema,
  startsAt: z.coerce.date(),
  price: priceSchema,
});
export type ShowtimeCreateInput = z.infer<typeof showtimeCreateSchema>;

/** The same times every day in a date range, e.g. 14:00 and 20:00 for two weeks. */
export const showtimeBulkSchema = z
  .object({
    movieId: z.uuid(),
    hallId: z.uuid(),
    format: formatSchema,
    price: priceSchema,
    from: dateSchema,
    to: dateSchema,
    times: z.array(timeSchema).min(1).max(12),
  })
  .refine(({ from, to }) => from <= to, { message: "from must not be after to", path: ["to"] })
  .refine(({ from, to }) => (Date.parse(to) - Date.parse(from)) / 86_400_000 <= 92, {
    message: "At most three months at a time",
    path: ["to"],
  });
export type ShowtimeBulkInput = z.infer<typeof showtimeBulkSchema>;

/** Why a showtime is cancelled or an order refunded; shown to staff and in the customer's email. */
export const reasonSchema = z.object({ reason: z.string().trim().min(3).max(200) });

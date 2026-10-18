import { CINEMA_TIME_ZONE } from "./i18n.js";

/**
 * Automatic ticket discounts, flagged on each showtime from its start time alone; nobody sets
 * them by hand. At most one applies, the bigger one first.
 *
 * - People's day: every showtime on a Wednesday, 50% off.
 * - Daytime: other weekdays, showtimes starting before 17:00 (working hours, the quiet part
 *   of the day), 15% off.
 */
export type DiscountKind = "PEOPLES_DAY" | "DAYTIME";

export interface Discount {
  kind: DiscountKind;
  percent: number;
}

export const PEOPLES_DAY_PERCENT = 50;
export const DAYTIME_PERCENT = 15;
/** Daytime discount applies to showtimes starting before this hour, cinema time. */
export const DAYTIME_ENDS_HOUR = 17;

const localParts = new Intl.DateTimeFormat("en-US", {
  timeZone: CINEMA_TIME_ZONE,
  weekday: "short",
  hour: "numeric",
  hourCycle: "h23",
});

/** The discount a showtime starting at `startsAt` gets, judged in the cinema's time zone. */
export function discountFor(startsAt: Date): Discount | null {
  const parts = localParts.formatToParts(startsAt);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);

  if (weekday === "Wed") return { kind: "PEOPLES_DAY", percent: PEOPLES_DAY_PERCENT };
  const weekdays = ["Mon", "Tue", "Thu", "Fri"];
  if (weekday && weekdays.includes(weekday) && hour < DAYTIME_ENDS_HOUR) {
    return { kind: "DAYTIME", percent: DAYTIME_PERCENT };
  }
  return null;
}

/** A price in cents after a discount, rounded to whole cents. */
export function applyDiscount(price: number, discount: Discount | null): number {
  return discount ? Math.round((price * (100 - discount.percent)) / 100) : price;
}

/** What a showtime's seat costs now: the list price, the discount and the price to pay. */
export function seatPricing(showtime: { price: number; startsAt: Date }) {
  const discount = discountFor(showtime.startsAt);
  return { basePrice: showtime.price, discount, price: applyDiscount(showtime.price, discount) };
}

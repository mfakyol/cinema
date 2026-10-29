/** How long a seat stays locked while the customer pays. */
export const SEAT_LOCK_TTL_MS = 10 * 60 * 1000;

/** Maximum seats one user or kiosk session can hold at the same time. */
export const MAX_LOCKS_PER_HOLDER = 10;

/** Most units of one product in a single order. */
export const MAX_ITEM_QUANTITY = 10;

/** Kiosk resets its session after this much inactivity. */
export const KIOSK_IDLE_TIMEOUT_MS = 60 * 1000;

export const Role = {
  CUSTOMER: "CUSTOMER",
  STAFF: "STAFF",
  ADMIN: "ADMIN",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const SeatType = {
  STANDARD: "STANDARD",
  WHEELCHAIR: "WHEELCHAIR",
} as const;
export type SeatType = (typeof SeatType)[keyof typeof SeatType];

export const TicketStatus = {
  PAID: "PAID",
  USED: "USED",
  CANCELLED: "CANCELLED",
} as const;
export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus];

export const OrderStatus = {
  PENDING: "PENDING",
  PAID: "PAID",
  FAILED: "FAILED",
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const ProductCategory = {
  COMBO: "COMBO",
  SNACK: "SNACK",
  DRINK: "DRINK",
  GLASSES: "GLASSES",
} as const;
export type ProductCategory = (typeof ProductCategory)[keyof typeof ProductCategory];

export const ShowFormat = {
  TWO_D: "TWO_D",
  THREE_D: "THREE_D",
  IMAX: "IMAX",
  IMAX_3D: "IMAX_3D",
} as const;
export type ShowFormat = (typeof ShowFormat)[keyof typeof ShowFormat];

/** Display order of formats when a day lists several. */
export const SHOW_FORMATS: readonly ShowFormat[] = ["TWO_D", "THREE_D", "IMAX", "IMAX_3D"];

/** Whether viewers need 3D glasses, so glasses are offered (and only then sold). */
export const needsGlasses = (format: ShowFormat) => format === "THREE_D" || format === "IMAX_3D";

export const SalesChannel = {
  WEB: "WEB",
  MOBILE: "MOBILE",
  KIOSK: "KIOSK",
} as const;
export type SalesChannel = (typeof SalesChannel)[keyof typeof SalesChannel];

/** Seat state as shown on the seat map. */
export type SeatState = "free" | "locked" | "sold";

/** Socket.io events broadcast to a showtime room. */
export const SocketEvent = {
  JOIN_SHOWTIME: "showtime:join",
  SEAT_LOCKED: "seat:locked",
  SEAT_RELEASED: "seat:released",
  SEAT_SOLD: "seat:sold",
} as const;

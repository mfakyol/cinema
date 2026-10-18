/** How long a seat stays locked while the customer pays. */
export const SEAT_LOCK_TTL_MS = 7 * 60 * 1000;

/** Maximum seats one user or kiosk session can hold at the same time. */
export const MAX_LOCKS_PER_HOLDER = 10;

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
  VIP: "VIP",
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

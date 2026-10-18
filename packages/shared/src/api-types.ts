import type { SeatState } from "./constants.js";

/** Response shapes of the REST API, shared by every client. Dates arrive as ISO strings. */

export interface Movie {
  id: string;
  title: string;
  description: string;
  durationMin: number;
  genre: string;
  posterUrl: string | null;
}

export interface Showtime {
  id: string;
  startsAt: string;
  price: number;
  hall: { id: string; name: string };
}

export interface SeatMapSeat {
  id: string;
  row: string;
  number: number;
  type: "STANDARD" | "VIP";
  state: SeatState;
  /** Only for the caller's own locks. */
  lockId?: string;
  lockExpiresAt?: string;
}

export interface SeatMap {
  showtime: {
    id: string;
    startsAt: string;
    price: number;
    movie: { id: string; title: string; durationMin: number };
    hall: { id: string; name: string };
  };
  seats: SeatMapSeat[];
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: "CUSTOMER" | "STAFF" | "ADMIN";
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Ticket {
  id: string;
  qrToken: string;
  status: "PAID" | "USED" | "CANCELLED";
  seat: { row: string; number: number; type: "STANDARD" | "VIP" };
  showtime: {
    id: string;
    startsAt: string;
    movie: { id: string; title: string; durationMin: number };
    hall: { id: string; name: string };
  };
}

export interface Order {
  id: string;
  status: "PENDING" | "PAID" | "FAILED";
  amount: number;
  contactEmail: string;
  /** Opens /orders/<accessToken>, the page linked from the confirmation email. */
  accessToken: string;
  tickets: { id: string; seatId: string; qrToken: string }[];
}

/** The public view of an order behind its emailed link. */
export interface OrderPage {
  id: string;
  amount: number;
  /** Partly hidden, e.g. "ja***@example.com". */
  email: string;
  tickets: Ticket[];
}

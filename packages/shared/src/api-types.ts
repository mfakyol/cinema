import type { ProductCategory, SeatState, ShowFormat } from "./constants.js";
import type { Locale } from "./i18n.js";
import type { Discount } from "./pricing.js";

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
  /** Seat price to pay, in cents, after any discount. */
  price: number;
  /** List price before the discount. */
  basePrice: number;
  discount: Discount | null;
  format: ShowFormat;
  hall: { id: string; name: string };
}

/** A showtime with its movie, as the box office lists a whole day. */
export interface ScheduledShowtime extends Showtime {
  movie: Pick<Movie, "id" | "title" | "durationMin" | "genre" | "posterUrl">;
  /** Seats neither sold nor held right now. */
  seatsLeft: number;
}

export interface SeatMapSeat {
  id: string;
  row: string;
  number: number;
  /** Position in the row counting aisles; see SeatMap.columns. */
  column: number;
  type: "STANDARD" | "WHEELCHAIR";
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
    basePrice: number;
    discount: Discount | null;
    format: ShowFormat;
    movie: { id: string; title: string; durationMin: number };
    hall: { id: string; name: string };
  };
  /** How many columns the hall's widest row spans, aisles included. */
  columns: number;
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
  seat: { row: string; number: number; type: "STANDARD" | "WHEELCHAIR" };
  showtime: {
    id: string;
    startsAt: string;
    movie: { id: string; title: string; durationMin: number };
    hall: { id: string; name: string };
  };
}

/** Text in each supported language, e.g. a product name. */
export type Localized = Record<Locale, string>;

export interface Product {
  id: string;
  name: Localized;
  /** What a combo contains. */
  description: Localized | null;
  category: ProductCategory;
  /** Price in cents. */
  price: number;
}

/** One unit of a product to collect at the stand; USED means collected. */
export interface ConcessionVoucher {
  id: string;
  qrToken: string;
  status: "PAID" | "USED" | "CANCELLED";
  usedAt: string | null;
  product: { id: string; name: Localized; category: ProductCategory };
  showtime: { id: string; startsAt: string; movie: { id: string; title: string }; hall: { id: string; name: string } };
}

export interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  product: { name: Localized; category: ProductCategory };
  vouchers: { id: string; qrToken: string; status: "PAID" | "USED" | "CANCELLED" }[];
}

export interface Order {
  id: string;
  status: "PENDING" | "PAID" | "FAILED";
  amount: number;
  contactEmail: string | null;
  paymentMethod: "CARD" | "CASH";
  /** Opens /orders/<accessToken>, the page linked from the confirmation email. */
  accessToken: string;
  tickets: { id: string; seatId: string; qrToken: string }[];
  items: OrderItem[];
}

/** The public view of an order behind its emailed link. */
export interface OrderPage {
  id: string;
  amount: number;
  /** Partly hidden, e.g. "ja***@example.com"; null for a box-office sale without one. */
  email: string | null;
  tickets: Ticket[];
  vouchers: ConcessionVoucher[];
}

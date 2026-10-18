import type { SeatState } from "@sinema/shared";
import { getSessionToken } from "./session";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** An error response from the API; `code` matches a key under `errors` in the messages. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getSessionToken();
  const response = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error?.code ?? "generic",
      body?.error?.message ?? response.statusText,
    );
  }
  return body as T;
}

export const postJson = <T>(path: string, data: unknown) =>
  apiFetch<T>(path, { method: "POST", body: JSON.stringify(data) });

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

export interface Ticket {
  id: string;
  qrToken: string;
  status: "PAID" | "USED" | "CANCELLED";
  seat: { row: string; number: number; type: "STANDARD" | "VIP" };
  showtime: {
    id: string;
    startsAt: string;
    movie: { id: string; title: string };
    hall: { id: string; name: string };
  };
}

export interface Order {
  id: string;
  status: "PENDING" | "PAID" | "FAILED";
  amount: number;
  tickets: { id: string; seatId: string; qrToken: string }[];
}

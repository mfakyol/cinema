import { getSessionToken, setSession } from "./session";

// Response shapes are shared by every client; see @sinema/shared.
export type {
  ConcessionVoucher,
  Movie,
  Order,
  OrderItem,
  OrderPage,
  Product,
  SeatMap,
  SeatMapSeat,
  Showtime,
  Ticket,
  User,
} from "@sinema/shared";

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
  // An expired or revoked token: forget it, so the next action starts a fresh session.
  if (response.status === 401 && token) setSession(null);
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

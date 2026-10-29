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

export const postJson = <T>(path: string, data: unknown, headers?: Record<string, string>) =>
  apiFetch<T>(path, { method: "POST", body: JSON.stringify(data), headers });

/**
 * Starts a checkout and follows it to the end. A card payment comes back PENDING (202) and is
 * settled by the provider's webhook, so the order is read again until it is PAID or FAILED.
 * FAILED throws PAYMENT_DECLINED; still pending after `timeoutMs` throws PAYMENT_TIMEOUT.
 * Each call is one payment attempt with its own Idempotency-Key.
 */
export async function checkoutAndWait<O extends { id: string; status: string }>(
  path: string,
  body: unknown,
  { intervalMs = 600, timeoutMs = 30_000 }: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<O> {
  let { order } = await postJson<{ order: O }>(path, body, { "Idempotency-Key": crypto.randomUUID() });
  const deadline = Date.now() + timeoutMs;
  while (order.status === "PENDING") {
    if (Date.now() > deadline) throw new ApiError(408, "PAYMENT_TIMEOUT", "Payment still pending");
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    ({ order } = await apiFetch<{ order: O }>(`/checkout/orders/${order.id}`));
  }
  if (order.status === "FAILED") throw new ApiError(402, "PAYMENT_DECLINED", "Payment declined");
  return order;
}

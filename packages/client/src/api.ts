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

export interface ApiClientOptions {
  /** e.g. "http://192.168.1.20:4000", without "/api". */
  baseUrl: string;
  getToken: () => string | undefined;
  /** Called when the API rejects the token, so the app can sign out. */
  onUnauthorized?: () => void;
}

export interface ApiClient {
  readonly baseUrl: string;
  fetch<T>(path: string, init?: RequestInit): Promise<T>;
  post<T>(path: string, data: unknown, headers?: Record<string, string>): Promise<T>;
}

export function createApiClient({ baseUrl, getToken, onUnauthorized }: ApiClientOptions): ApiClient {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = getToken();
    const response = await fetch(`${baseUrl}/api${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    // A 401 from sign-in means a wrong password, not an expired session: never sign out for it.
    if (response.status === 401 && token && !path.startsWith("/auth/")) onUnauthorized?.();
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

  return {
    baseUrl,
    fetch: request,
    post: (path, data, headers) => request(path, { method: "POST", body: JSON.stringify(data), headers }),
  };
}

/** The `errors.*` message key for any thrown error. */
export function errorCode(error: unknown): string {
  return error instanceof ApiError ? error.code : "generic";
}

/** A new Idempotency-Key for one payment attempt; retries of that attempt reuse it. */
export const newIdempotencyKey = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

interface SettledOrder {
  id: string;
  status: "PENDING" | "PAID" | "FAILED";
}

/**
 * Starts a checkout and follows it to the end. A card payment comes back PENDING (202) and is
 * settled by the provider's webhook, so the order is read again until it is PAID or FAILED.
 * FAILED throws PAYMENT_DECLINED; still pending after `timeoutMs` throws PAYMENT_TIMEOUT.
 */
export async function checkoutAndWait<O extends SettledOrder>(
  api: ApiClient,
  path: string,
  body: unknown,
  { intervalMs = 600, timeoutMs = 30_000 }: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<O> {
  let { order } = await api.post<{ order: O }>(path, body, { "Idempotency-Key": newIdempotencyKey() });
  const deadline = Date.now() + timeoutMs;
  while (order.status === "PENDING") {
    if (Date.now() > deadline) throw new ApiError(408, "PAYMENT_TIMEOUT", "Payment still pending");
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    ({ order } = await api.fetch<{ order: O }>(`/checkout/orders/${order.id}`));
  }
  if (order.status === "FAILED") throw new ApiError(402, "PAYMENT_DECLINED", "Payment declined");
  return order;
}


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
  post<T>(path: string, data: unknown): Promise<T>;
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
    post: (path, data) => request(path, { method: "POST", body: JSON.stringify(data) }),
  };
}

/** The `errors.*` message key for any thrown error. */
export function errorCode(error: unknown): string {
  return error instanceof ApiError ? error.code : "generic";
}

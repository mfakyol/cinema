import { createApiClient } from "@sinema/client";
import { sessionStore } from "./session";

/** Where the API runs; VITE_API_URL wins, otherwise port 4000 on this machine. */
export const API_URL = import.meta.env.VITE_API_URL ?? `http://${window.location.hostname}:4000`;

/**
 * The website, which order and ticket QR codes link to; it must match the API's WEB_URL so
 * codes on the customer screen and in emails are the same.
 */
export const SITE_URL = import.meta.env.VITE_SITE_URL ?? `http://${window.location.hostname}:3000`;

export const api = createApiClient({
  baseUrl: API_URL,
  getToken: () => sessionStore.token(),
  onUnauthorized: () => void sessionStore.set(null),
});

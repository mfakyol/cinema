import { createApiClient } from "@sinema/client";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { sessionStore } from "./session";

/** The development machine: the address Expo Go loaded the bundle from (or the web page's host). */
function devHost(): string {
  return Platform.OS === "web"
    ? window.location.hostname
    : (Constants.expoConfig?.hostUri?.split(":")[0] ?? "localhost");
}

/** Where the API runs; EXPO_PUBLIC_API_URL wins, otherwise port 4000 on the development machine. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? `http://${devHost()}:4000`;

/**
 * The website, which ticket QR codes link to; it must match the API's WEB_URL so codes shown in
 * the app and in emails are the same. EXPO_PUBLIC_SITE_URL wins, otherwise port 3000.
 */
export const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL ?? `http://${devHost()}:3000`;

export const api = createApiClient({
  baseUrl: API_URL,
  getToken: () => sessionStore.token(),
  onUnauthorized: () => void sessionStore.set(null),
});

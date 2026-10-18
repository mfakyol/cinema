import { createSessionStore, type SessionStorage, useSessionState } from "@sinema/client";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "sinema.session";

// The token is a credential, so it lives in the Keychain / Keystore. SecureStore has no web
// version; the web build (used for development) falls back to localStorage.
const storage: SessionStorage =
  Platform.OS === "web"
    ? {
        load: async () => window.localStorage.getItem(KEY),
        save: async (value) =>
          value ? window.localStorage.setItem(KEY, value) : window.localStorage.removeItem(KEY),
      }
    : {
        load: () => SecureStore.getItemAsync(KEY),
        save: (value) => (value ? SecureStore.setItemAsync(KEY, value) : SecureStore.deleteItemAsync(KEY)),
      };

export const sessionStore = createSessionStore(storage);

export const useSession = () => useSessionState(sessionStore);

import { createSessionStore, type SessionStorage, useSessionState } from "@sinema/client";

const KEY = "sinema.kiosk.session";

// Both windows of the box office run in the same browser profile and share this entry.
const storage: SessionStorage = {
  load: async () => {
    try {
      return window.localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  save: async (value) => {
    try {
      if (value) window.localStorage.setItem(KEY, value);
      else window.localStorage.removeItem(KEY);
    } catch {
      // Storage can be unavailable (private mode); the session then lasts for this window only.
    }
  },
};

export const sessionStore = createSessionStore(storage);

// The customer screen follows sign-in and sign-out on the staff screen.
window.addEventListener("storage", (event) => {
  if (event.key === KEY) void sessionStore.restore();
});

export const useSession = () => useSessionState(sessionStore);

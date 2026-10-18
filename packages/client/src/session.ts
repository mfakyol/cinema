import type { User } from "@sinema/shared";
import { useSyncExternalStore } from "react";

export interface Session {
  token: string;
  user: User;
}

/** Where a session is kept between launches, e.g. the device's secure storage. */
export interface SessionStorage {
  load(): Promise<string | null>;
  save(value: string | null): Promise<void>;
}

export interface SessionState {
  /** False until the stored session has been read at launch. */
  ready: boolean;
  session: Session | null;
}

export interface SessionStore {
  getState(): SessionState;
  subscribe(listener: () => void): () => void;
  /** Reads the stored session; call once at launch. */
  restore(): Promise<void>;
  set(session: Session | null): Promise<void>;
  token(): string | undefined;
}

export function createSessionStore(storage: SessionStorage): SessionStore {
  let state: SessionState = { ready: false, session: null };
  const listeners = new Set<() => void>();
  const update = (next: SessionState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async restore() {
      let session: Session | null = null;
      try {
        const raw = await storage.load();
        session = raw ? (JSON.parse(raw) as Session) : null;
      } catch {
        session = null;
      }
      update({ ready: true, session });
    },
    async set(session) {
      update({ ready: true, session });
      await storage.save(session ? JSON.stringify(session) : null);
    },
    token: () => state.session?.token,
  };
}

export function useSessionState(store: SessionStore): SessionState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

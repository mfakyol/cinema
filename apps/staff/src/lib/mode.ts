import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

/** What this device checks: tickets at the hall door, or snacks and glasses at the stand. */
export type ScanMode = "door" | "stand";

const KEY = "sinema.staff-mode";

const storage = {
  load: async (): Promise<string | null> =>
    Platform.OS === "web" ? window.localStorage.getItem(KEY) : SecureStore.getItemAsync(KEY),
  save: async (value: string) =>
    Platform.OS === "web" ? window.localStorage.setItem(KEY, value) : SecureStore.setItemAsync(KEY, value),
};

/** The device's scan mode, remembered between launches; a phone usually stays at one post. */
export function useScanMode(): [ScanMode, (mode: ScanMode) => void] {
  const [mode, setMode] = useState<ScanMode>("door");

  useEffect(() => {
    void storage.load().then((saved) => {
      if (saved === "door" || saved === "stand") setMode(saved);
    });
  }, []);

  const change = (next: ScanMode) => {
    setMode(next);
    void storage.save(next);
  };
  return [mode, change];
}

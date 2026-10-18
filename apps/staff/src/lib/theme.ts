import { useColorScheme } from "react-native";

/** The website's palette (shadcn neutral + cinema red), so the app and the site look alike. */
export const palette = {
  light: {
    // A soft warm off-white instead of pure white, easier on the eyes; cards stay white.
    background: "#f5f4f1",
    foreground: "#0a0a0a",
    card: "#ffffff",
    muted: "#ebe9e5",
    mutedForeground: "#737373",
    border: "#e0ddd8",
    primary: "#c8102e",
    primaryForeground: "#fafafa",
    destructive: "#dc2626",
    success: "#16a34a",
    seatTaken: "#cfcbc5",
  },
  dark: {
    background: "#0a0a0a",
    foreground: "#fafafa",
    card: "#171717",
    muted: "#262626",
    mutedForeground: "#a3a3a3",
    border: "#2e2e2e",
    primary: "#e5484d",
    primaryForeground: "#fafafa",
    destructive: "#f87171",
    success: "#22c55e",
    seatTaken: "#404040",
  },
} as const;

export type Colors = { [Key in keyof (typeof palette)["light"]]: string };

/** Light or dark from the system setting. */
export function useColors(): Colors {
  return palette[useColorScheme() === "dark" ? "dark" : "light"];
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 14 } as const;

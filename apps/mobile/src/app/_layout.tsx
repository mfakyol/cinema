import "@/lib/polyfills";
import { ApiError } from "@sinema/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { useColorScheme } from "react-native";
import { useTranslations } from "use-intl";
import { I18nProvider } from "@/lib/i18n";
import { sessionStore, useSession } from "@/lib/session";
import { palette } from "@/lib/theme";

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // A 4xx will not change on retry; only retry network and server errors.
      retry: (failureCount, error) => !(error instanceof ApiError && error.status < 500) && failureCount < 2,
    },
  },
});

function Navigator() {
  const t = useTranslations();
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: "minimal" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="movies/[id]" options={{ title: "" }} />
      <Stack.Screen name="showtimes/[id]" options={{ title: t("movie.showtimes") }} />
      <Stack.Screen name="tickets/[id]" options={{ title: t("tickets.ticketTitle") }} />
      <Stack.Screen name="sign-in" options={{ presentation: "modal", title: t("common.signIn") }} />
      <Stack.Screen name="register" options={{ presentation: "modal", title: t("common.register") }} />
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const { ready } = useSession();

  useEffect(() => {
    void sessionStore.restore();
  }, []);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const colors = palette[scheme === "dark" ? "dark" : "light"];
  const theme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.background,
      text: colors.foreground,
      border: colors.border,
    },
  };

  // Keep the splash screen up until we know whether someone is signed in.
  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <ThemeProvider value={theme}>
          <StatusBar style="auto" />
          <Navigator />
        </ThemeProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

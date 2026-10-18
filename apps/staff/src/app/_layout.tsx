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
    mutations: { retry: false },
    queries: {
      retry: (failureCount, error) => !(error instanceof ApiError && error.status < 500) && failureCount < 2,
    },
  },
});

function Navigator() {
  const t = useTranslations("staff");
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: t("title") }} />
      <Stack.Screen name="sign-in" options={{ title: t("signInTitle") }} />
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
      // Header and tab bar use the card colour, so they stand apart from the off-white page.
      card: colors.card,
      text: colors.foreground,
      border: colors.border,
    },
  };

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

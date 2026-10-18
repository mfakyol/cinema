import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Tabs } from "expo-router/tabs";
import type { ColorValue } from "react-native";
import { useTranslations } from "use-intl";
import { useColors } from "@/lib/theme";

function icon(name: SymbolViewProps["name"]) {
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <SymbolView name={name} tintColor={typeof color === "string" ? color : undefined} size={size} />;
  }
  return TabIcon;
}

export default function TabsLayout() {
  const t = useTranslations("app");
  const colors = useColors();
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.primary }}>
      <Tabs.Screen
        name="index"
        options={{ title: t("tabMovies"), tabBarIcon: icon({ ios: "film", android: "movie", web: "movie" }) }}
      />
      <Tabs.Screen
        name="tickets"
        options={{
          title: t("tabTickets"),
          tabBarIcon: icon({ ios: "ticket", android: "confirmation_number", web: "confirmation_number" }),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t("tabAccount"),
          tabBarIcon: icon({ ios: "person.crop.circle", android: "account_circle", web: "account_circle" }),
        }}
      />
    </Tabs>
  );
}

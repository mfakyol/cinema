import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useTranslations } from "use-intl";
import { Button, Card, Screen, Text } from "@/components/ui";
import { sessionStore, useSession } from "@/lib/session";

export default function AccountScreen() {
  const t = useTranslations();
  const { session } = useSession();
  const queryClient = useQueryClient();

  if (!session) {
    return (
      <Screen>
        <Text variant="title">{t("app.tabAccount")}</Text>
        <Text variant="muted">{t("app.signInToBuy")}</Text>
        <Button title={t("common.signIn")} onPress={() => router.push("/sign-in")} />
        <Button title={t("common.register")} variant="outline" onPress={() => router.push("/register")} />
        <Text variant="small">{t("common.tmdbAttribution")}</Text>
      </Screen>
    );
  }

  const signOut = async () => {
    await sessionStore.set(null);
    queryClient.clear();
  };

  return (
    <Screen>
      <Text variant="title">{t("app.tabAccount")}</Text>
      <Card>
        <Text variant="heading">{session.user.name}</Text>
        <Text variant="muted">{session.user.email}</Text>
      </Card>
      <Button title={t("common.signOut")} variant="outline" onPress={() => void signOut()} />
      <Text variant="small">{t("common.tmdbAttribution")}</Text>
    </Screen>
  );
}

import type { Ticket } from "@sinema/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, router } from "expo-router";
import { Pressable, View } from "react-native";
import { useFormatter, useTranslations } from "use-intl";
import { LoadError } from "@/components/load-error";
import { TicketQr } from "@/components/ticket-qr";
import { Button, Card, Loading, Screen, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { spacing, useColors } from "@/lib/theme";

export default function TicketsScreen() {
  const t = useTranslations();
  const format = useFormatter();
  const colors = useColors();
  const { session } = useSession();
  const tickets = useQuery({
    queryKey: ["tickets", session?.user.id],
    queryFn: () => api.fetch<{ tickets: Ticket[] }>("/me/tickets"),
    enabled: Boolean(session),
  });

  if (!session) {
    return (
      <Screen>
        <Text variant="muted">{t("app.signInForTickets")}</Text>
        <Button title={t("common.signIn")} onPress={() => router.push("/sign-in")} />
      </Screen>
    );
  }

  return (
    <Screen refreshing={tickets.isRefetching} onRefresh={() => void tickets.refetch()}>
      <Text variant="title">{t("tickets.title")}</Text>
      {tickets.isError && <LoadError onRetry={() => void tickets.refetch()} />}
      {tickets.isPending && <Loading />}
      {tickets.data?.tickets.length === 0 && (
        <>
          <Text variant="muted">{t("tickets.empty")}</Text>
          <Button title={t("tickets.browse")} variant="outline" onPress={() => router.navigate("/")} />
        </>
      )}
      {tickets.data?.tickets.map((ticket) => {
        const valid = ticket.status === "PAID";
        return (
          <Link key={ticket.id} href={`/tickets/${ticket.id}`} asChild>
            <Pressable accessibilityRole="link" style={({ pressed }) => ({ opacity: pressed ? 0.8 : valid ? 1 : 0.6 })}>
              <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg }}>
                <TicketQr qrToken={ticket.qrToken} size={80} label={t("tickets.showAtEntrance")} />
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <Text variant="small" style={{ color: valid ? colors.primary : colors.mutedForeground, fontWeight: "600" }}>
                    {t(`tickets.status.${ticket.status}`)}
                  </Text>
                  <Text style={{ fontWeight: "600" }} numberOfLines={1}>
                    {ticket.showtime.movie.title}
                  </Text>
                  <Text variant="small">
                    {format.dateTime(new Date(ticket.showtime.startsAt), {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                  <Text variant="small">
                    {ticket.showtime.hall.name} · {t("seats.seatLabel", { row: ticket.seat.row, number: ticket.seat.number })}
                  </Text>
                </View>
              </Card>
            </Pressable>
          </Link>
        );
      })}
    </Screen>
  );
}

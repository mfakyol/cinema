import { ticketUrl, type Ticket } from "@sinema/shared";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Share, useWindowDimensions, View } from "react-native";
import { useFormatter, useTranslations } from "use-intl";
import { LoadError } from "@/components/load-error";
import { TicketQr } from "@/components/ticket-qr";
import { Button, Card, Loading, Screen, Text } from "@/components/ui";
import { api, SITE_URL } from "@/lib/api";
import { useSession } from "@/lib/session";
import { spacing, useColors } from "@/lib/theme";

/** One ticket, large QR and every detail; the app's version of the website's ticket page. */
export default function TicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const format = useFormatter();
  const colors = useColors();
  const { width } = useWindowDimensions();
  const { session } = useSession();
  // The list is already loaded; read the ticket from it instead of another request.
  const tickets = useQuery({
    queryKey: ["tickets", session?.user.id],
    queryFn: () => api.fetch<{ tickets: Ticket[] }>("/me/tickets"),
    enabled: Boolean(session),
  });

  if (tickets.isError) {
    return (
      <Screen>
        <LoadError onRetry={() => void tickets.refetch()} />
      </Screen>
    );
  }
  const ticket = tickets.data?.tickets.find((item) => item.id === id);
  if (!ticket) return <Loading />;

  const startsAt = new Date(ticket.showtime.startsAt);
  const valid = ticket.status === "PAID";
  const seat = t("seats.seatLabel", { row: ticket.seat.row, number: ticket.seat.number });
  const details: [string, string][] = [
    [t("tickets.details.date"), format.dateTime(startsAt, { weekday: "long", day: "numeric", month: "long", year: "numeric" })],
    [t("tickets.details.time"), format.dateTime(startsAt, { hour: "2-digit", minute: "2-digit" })],
    [t("tickets.details.hall"), ticket.showtime.hall.name],
    [t("tickets.details.seat"), seat],
    [t("tickets.details.seatType"), ticket.seat.type === "VIP" ? t("seats.vip") : t("tickets.details.standard")],
    [t("tickets.details.duration"), t("common.minutes", { count: ticket.showtime.movie.durationMin })],
    [t("tickets.details.statusLabel"), t(`tickets.status.${ticket.status}`)],
  ];

  // Shares this ticket's own link, so a friend gets just their seat.
  const share = () =>
    Share.share({
      message: `${t("order.shareTicketText", { movie: ticket.showtime.movie.title, seat })}\n${ticketUrl(SITE_URL, ticket.qrToken)}`,
    });

  return (
    <Screen>
      <Card style={{ opacity: valid ? 1 : 0.7 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.md }}>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text variant="small" style={{ color: colors.primary, fontWeight: "600" }}>
              {t("common.appName")}
            </Text>
            <Text variant="title">{ticket.showtime.movie.title}</Text>
          </View>
          <Text variant="small" style={{ color: valid ? colors.primary : colors.mutedForeground, fontWeight: "600" }}>
            {t(`tickets.status.${ticket.status}`)}
          </Text>
        </View>
        <TicketQr qrToken={ticket.qrToken} size={Math.min(width - 96, 260)} label={t("tickets.showAtEntrance")} />
        {valid && (
          <Text variant="small" style={{ textAlign: "center" }}>
            {t("tickets.showAtEntrance")}
          </Text>
        )}
        <View>
          {details.map(([label, value]) => (
            <View
              key={label}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: spacing.md,
                paddingVertical: spacing.sm,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <Text variant="muted">{label}</Text>
              <Text style={{ fontWeight: "500", flexShrink: 1, textAlign: "right" }}>{value}</Text>
            </View>
          ))}
        </View>
      </Card>
      <Button title={t("order.shareTicket")} variant="outline" onPress={() => void share()} />
    </Screen>
  );
}

import type { ConcessionVoucher, Ticket } from "@sinema/shared";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useFormatter, useLocale, useTranslations } from "use-intl";
import { LoadError } from "@/components/load-error";
import { TicketQr } from "@/components/ticket-qr";
import { Button, Card, Loading, Screen, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { spacing, useColors } from "@/lib/theme";

/** A tappable row with a small QR code on the left. */
function QrRow({
  qr,
  status,
  valid,
  onPress,
  children,
}: {
  qr: ReactNode;
  status: string;
  valid: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : valid ? 1 : 0.6 })}
    >
      <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg }}>
        {qr}
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text variant="small" style={{ color: valid ? colors.primary : colors.mutedForeground, fontWeight: "600" }}>
            {status}
          </Text>
          {children}
        </View>
      </Card>
    </Pressable>
  );
}

export default function TicketsScreen() {
  const t = useTranslations();
  const format = useFormatter();
  const locale = useLocale() as "en" | "tr";
  const { session } = useSession();
  const tickets = useQuery({
    queryKey: ["tickets", session?.user.id],
    queryFn: () => api.fetch<{ tickets: Ticket[] }>("/me/tickets"),
    enabled: Boolean(session),
  });
  const vouchers = useQuery({
    queryKey: ["concessions", session?.user.id],
    queryFn: () => api.fetch<{ vouchers: ConcessionVoucher[] }>("/me/concessions"),
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

  const when = (startsAt: string) =>
    format.dateTime(new Date(startsAt), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const refresh = () => void Promise.all([tickets.refetch(), vouchers.refetch()]);

  return (
    <Screen refreshing={tickets.isRefetching || vouchers.isRefetching} onRefresh={refresh}>
      <Text variant="title">{t("tickets.title")}</Text>
      {(tickets.isError || vouchers.isError) && <LoadError onRetry={refresh} />}
      {tickets.isPending && <Loading />}
      {tickets.data?.tickets.length === 0 && (
        <>
          <Text variant="muted">{t("tickets.empty")}</Text>
          <Button title={t("tickets.browse")} variant="outline" onPress={() => router.navigate("/")} />
        </>
      )}
      {tickets.data?.tickets.map((ticket) => (
        <QrRow
          key={ticket.id}
          qr={<TicketQr qrToken={ticket.qrToken} size={80} label={t("tickets.showAtEntrance")} />}
          status={t(`tickets.status.${ticket.status}`)}
          valid={ticket.status === "PAID"}
          onPress={() => router.push(`/tickets/${ticket.id}`)}
        >
          <Text style={{ fontWeight: "600" }} numberOfLines={1}>
            {ticket.showtime.movie.title}
          </Text>
          <Text variant="small">{when(ticket.showtime.startsAt)}</Text>
          <Text variant="small">
            {ticket.showtime.hall.name} · {t("seats.seatLabel", { row: ticket.seat.row, number: ticket.seat.number })}
          </Text>
        </QrRow>
      ))}

      {vouchers.data && vouchers.data.vouchers.length > 0 && (
        <>
          <Text variant="heading" style={{ marginTop: spacing.sm }}>
            {t("concessions.title")}
          </Text>
          {vouchers.data.vouchers.map((voucher) => (
            <QrRow
              key={voucher.id}
              qr={<TicketQr kind="concession" qrToken={voucher.qrToken} size={64} label={t("concessions.showAtStand")} />}
              status={t(`concessions.status.${voucher.status}`)}
              valid={voucher.status === "PAID"}
              onPress={() => router.push({ pathname: "/concessions/[id]", params: { id: voucher.id } })}
            >
              <Text style={{ fontWeight: "600" }} numberOfLines={1}>
                {voucher.product.name[locale]}
              </Text>
              {voucher.showtime && (
                <Text variant="small" numberOfLines={1}>
                  {voucher.showtime.movie.title} · {when(voucher.showtime.startsAt)}
                </Text>
              )}
            </QrRow>
          ))}
        </>
      )}
    </Screen>
  );
}

import { useLiveSeatMap } from "@sinema/client";
import type { Order, SeatMap, SeatMapSeat } from "@sinema/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";
import { useFormatter, useLocale, useTranslations } from "use-intl";
import { LoadError } from "@/components/load-error";
import { SeatGrid } from "@/components/seat-grid";
import { Button, Card, Loading, Notice, Screen, Text } from "@/components/ui";
import { api, API_URL } from "@/lib/api";
import { useErrorMessage, usePrice } from "@/lib/format";
import { useSession } from "@/lib/session";
import { spacing, useColors } from "@/lib/theme";
import { formatRemaining, useCountdown } from "@/lib/use-countdown";

export default function ShowtimeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const format = useFormatter();
  const locale = useLocale();
  const price = usePrice();
  const errorMessage = useErrorMessage();
  const colors = useColors();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [purchased, setPurchased] = useState<Order | null>(null);

  // Keyed by user so signing in refetches with the right "mine" flags.
  const queryKey = ["seats", id, session?.user.id ?? "anonymous"] as const;
  const seatMap = useQuery({ queryKey, queryFn: () => api.fetch<SeatMap>(`/showtimes/${id}/seats`) });
  const live = useLiveSeatMap(API_URL, id, queryKey);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["seats", id] });
  const showError = (error: unknown) => Alert.alert(errorMessage(error));

  const toggleSeat = useMutation({
    mutationFn: (seat: SeatMapSeat) =>
      seat.lockId
        ? api.fetch<void>(`/locks/${seat.lockId}`, { method: "DELETE" })
        : api.post(`/showtimes/${id}/locks`, { seatIds: [seat.id] }),
    onError: showError,
    onSettled: refresh,
  });

  const pay = useMutation({
    mutationFn: (simulate: "success" | "decline") =>
      api.post<{ order: Order }>("/checkout", {
        showtimeId: id,
        idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        channel: "MOBILE",
        // The app requires an account, so tickets go to the account's email.
        email: session!.user.email,
        locale,
        simulate,
      }),
    onSuccess: ({ order }) => {
      setPurchased(order);
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: showError,
    onSettled: refresh,
  });

  const mine = seatMap.data?.seats.filter((seat) => seat.lockId) ?? [];
  const firstExpiry = mine.map((seat) => seat.lockExpiresAt!).sort().at(0);
  const remaining = useCountdown(firstExpiry, () => void refresh());

  if (seatMap.isError) {
    return (
      <Screen>
        <LoadError onRetry={() => void seatMap.refetch()} />
      </Screen>
    );
  }
  if (!seatMap.data) return <Loading />;

  const { showtime, seats } = seatMap.data;
  const onToggle = (seat: SeatMapSeat) => {
    // Buying needs an account in the app.
    if (!session) {
      router.push("/sign-in");
      return;
    }
    toggleSeat.mutate(seat);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: showtime.movie.title }} />
      <View style={{ gap: spacing.xs }}>
        <Text variant="heading">{showtime.movie.title}</Text>
        <Text variant="muted">
          {format.dateTime(new Date(showtime.startsAt), {
            weekday: "long",
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          · {showtime.hall.name}
          {live ? `  ● ${t("seats.live")}` : ""}
        </Text>
      </View>

      <Card>
        <SeatGrid
          seats={seats}
          busySeatId={toggleSeat.isPending ? toggleSeat.variables.id : null}
          onToggle={onToggle}
        />
        <Text variant="small" style={{ textAlign: "center" }}>
          {session ? t("seats.pickHint") : t("app.signInToBuy")}
        </Text>
      </Card>

      {purchased ? (
        <Card>
          <Text variant="heading" style={{ color: colors.success }}>
            ✓ {t("seats.purchased")}
          </Text>
          <Text variant="muted">
            {t("seats.ticketCount", { count: purchased.tickets.length })} · {price(purchased.amount)}
          </Text>
          <Text variant="small">{t("app.ticketsSentTo", { email: purchased.contactEmail })}</Text>
          <Button title={t("seats.viewTickets")} onPress={() => router.navigate("/tickets")} />
        </Card>
      ) : (
        <Card>
          <Text variant="heading">{t("seats.selected", { count: mine.length })}</Text>
          {remaining !== null && (
            <Text variant="small" accessibilityLiveRegion="polite">
              {t("seats.heldFor", { time: formatRemaining(remaining) })}
            </Text>
          )}
          {mine.map((seat) => (
            <View key={seat.id} style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text>{t("seats.seatLabel", { row: seat.row, number: seat.number })}</Text>
              <Text variant="muted">{price(showtime.price)}</Text>
            </View>
          ))}
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontWeight: "700" }}>{t("seats.total")}</Text>
            <Text style={{ fontWeight: "700" }}>{price(showtime.price * mine.length)}</Text>
          </View>
          {!session && <Notice tone="info" text={t("app.signInToBuy")} />}
          <Button
            title={t("seats.pay", { amount: price(showtime.price * mine.length) })}
            disabled={mine.length === 0 || !session}
            loading={pay.isPending && pay.variables === "success"}
            onPress={() => pay.mutate("success")}
          />
          <Button
            title={t("seats.payDeclined")}
            variant="ghost"
            disabled={mine.length === 0 || !session || pay.isPending}
            onPress={() => pay.mutate("decline")}
          />
        </Card>
      )}
    </Screen>
  );
}

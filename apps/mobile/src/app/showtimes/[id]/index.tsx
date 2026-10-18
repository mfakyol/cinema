import type { SeatMapSeat } from "@sinema/shared";
import { useMutation } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Alert, View } from "react-native";
import { useFormatter, useTranslations } from "use-intl";
import { LoadError } from "@/components/load-error";
import { PurchaseSteps } from "@/components/purchase-steps";
import { SeatGrid } from "@/components/seat-grid";
import { BottomBar, Button, Card, Loading, Screen, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { useErrorMessage, usePrice } from "@/lib/format";
import { useSession } from "@/lib/session";
import { spacing, useColors } from "@/lib/theme";
import { useSeatHold } from "@/lib/use-seat-hold";

/** Step 1 of 3: pick seats on the live map. */
export default function SeatsStep() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const format = useFormatter();
  const price = usePrice();
  const errorMessage = useErrorMessage();
  const colors = useColors();
  const { session } = useSession();
  const { seatMap, mine, remaining, live, refresh } = useSeatHold(id);

  const toggleSeat = useMutation({
    mutationFn: (seat: SeatMapSeat) =>
      seat.lockId
        ? api.fetch<void>(`/locks/${seat.lockId}`, { method: "DELETE" })
        : api.post(`/showtimes/${id}/locks`, { seatIds: [seat.id] }),
    onError: (error) => Alert.alert(errorMessage(error)),
    onSettled: refresh,
  });

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
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: showtime.movie.title }} />
      <Screen>
        <PurchaseSteps current="seats" remaining={remaining} />
        <View style={{ gap: spacing.xs }}>
          <Text variant="heading">
            {showtime.movie.title}
            {showtime.format === "TWO_D" ? "" : ` · ${t(`format.${showtime.format}`)}`}
          </Text>
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
          {showtime.discount && (
            <Text variant="small" style={{ color: colors.success, fontWeight: "700" }}>
              {t(`discounts.${showtime.discount.kind}`, { percent: showtime.discount.percent })}
            </Text>
          )}
        </View>

        <Card>
          <SeatGrid
            seats={seats}
            columns={seatMap.data.columns}
            busySeatId={toggleSeat.isPending ? toggleSeat.variables.id : null}
            onToggle={onToggle}
          />
          <Text variant="small" style={{ textAlign: "center" }}>
            {session ? t("seats.pickHint") : t("app.signInToBuy")}
          </Text>
        </Card>
      </Screen>
      <BottomBar>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text variant="muted">{t("seats.selected", { count: mine.length })}</Text>
          <Text style={{ fontWeight: "700", color: colors.foreground }}>{price(showtime.price * mine.length)}</Text>
        </View>
        <Button
          title={session ? t("steps.continue") : t("common.signIn")}
          disabled={!!session && mine.length === 0}
          onPress={() => (session ? router.push(`/showtimes/${id}/extras`) : router.push("/sign-in"))}
        />
      </BottomBar>
    </View>
  );
}

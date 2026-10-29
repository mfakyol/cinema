import type { Order, Product } from "@sinema/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";
import { useFormatter, useLocale, useTranslations } from "use-intl";
import { checkoutAndWait } from "@sinema/client";
import { PurchaseSteps } from "@/components/purchase-steps";
import { BottomBar, Button, Card, Loading, Notice, Screen, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { useErrorMessage, usePrice } from "@/lib/format";
import { useSession } from "@/lib/session";
import { spacing, useColors } from "@/lib/theme";
import { useSeatHold } from "@/lib/use-seat-hold";

/** A fresh key per payment attempt; a retry of the same request would reuse it. */

/** Step 3 of 3: the basket (tickets and items), the total, and payment. */
export default function CheckoutStep() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const format = useFormatter();
  const locale = useLocale() as "en" | "tr";
  const price = usePrice();
  const errorMessage = useErrorMessage();
  const colors = useColors();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const { seatMap, mine, remaining, refresh } = useSeatHold(id);
  const cart = useCart(id);
  const [purchased, setPurchased] = useState<Order | null>(null);
  // Same query as the snacks step, so this is read from the cache.
  const products = useQuery({
    queryKey: ["products", id],
    queryFn: () => api.fetch<{ products: Product[] }>(`/products?showtimeId=${id}`),
  });

  const lines = (products.data?.products ?? [])
    .filter((product) => cart.quantities.has(product.id))
    .map((product) => ({ product, quantity: cart.quantities.get(product.id)! }));

  const pay = useMutation({
    mutationFn: (simulate: "success" | "decline") =>
      checkoutAndWait<Order>(api, "/checkout", {
        showtimeId: id,
        channel: "MOBILE",
        // The app requires an account, so tickets go to the account's email.
        email: session!.user.email,
        locale,
        items: lines.map(({ product, quantity }) => ({ productId: product.id, quantity })),
        simulate,
      }),
    onSuccess: (order) => {
      setPurchased(order);
      cart.clear();
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
      void queryClient.invalidateQueries({ queryKey: ["concessions"] });
    },
    onError: (error) => Alert.alert(errorMessage(error)),
    onSettled: refresh,
  });

  if (!seatMap.data || products.isPending) return <Loading />;
  const { showtime } = seatMap.data;

  if (purchased) {
    return (
      <Screen>
        <Card>
          <Text variant="heading" style={{ color: colors.success }}>
            ✓ {t("seats.purchased")}
          </Text>
          <Text variant="muted">
            {t("seats.ticketCount", { count: purchased.tickets.length })} · {price(purchased.amount)}
          </Text>
          <Text variant="small">{t("app.ticketsSentTo", { email: purchased.contactEmail ?? session!.user.email })}</Text>
          <Button title={t("seats.viewTickets")} onPress={() => router.dismissTo("/tickets")} />
        </Card>
      </Screen>
    );
  }

  const ticketsTotal = showtime.price * mine.length;
  const itemsTotal = lines.reduce((sum, { product, quantity }) => sum + product.price * quantity, 0);
  const total = ticketsTotal + itemsTotal;
  const holdLost = mine.length === 0;
  const row = (left: string, right: string, bold = false) => (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
      <Text style={{ flex: 1, fontWeight: bold ? "700" : "400" }}>{left}</Text>
      <Text style={{ fontWeight: bold ? "700" : "400" }}>{right}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <PurchaseSteps current="payment" remaining={remaining} />
        <Text variant="title">{t("checkout.title")}</Text>

        <Card>
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
          </Text>
        </Card>

        {holdLost ? (
          <Notice
            text={t("checkout.holdLost")}
            action={
              <Button title={t("checkout.backToSeats")} variant="outline" onPress={() => router.dismissTo(`/showtimes/${id}`)} />
            }
          />
        ) : (
          <Card>
            <Text variant="heading">{t("checkout.tickets")}</Text>
            {mine.map((seat) => (
              <View key={seat.id}>{row(t("seats.seatLabel", { row: seat.row, number: seat.number }), price(showtime.price))}</View>
            ))}
            {showtime.discount && (
              <Text variant="small" style={{ color: colors.success, fontWeight: "600" }}>
                {t(`discounts.${showtime.discount.kind}`, { percent: showtime.discount.percent })} ·{" "}
                <Text variant="small" style={{ textDecorationLine: "line-through" }}>
                  {price(showtime.basePrice)}
                </Text>
              </Text>
            )}
            {lines.length > 0 && (
              <>
                <Text variant="heading" style={{ marginTop: spacing.sm }}>
                  {t("checkout.items")}
                </Text>
                {lines.map(({ product, quantity }) => (
                  <View key={product.id} style={{ gap: 2 }}>
                    {row(product.name[locale], price(product.price * quantity))}
                    <Text variant="small">{t("checkout.lineQuantity", { count: quantity, price: price(product.price) })}</Text>
                  </View>
                ))}
              </>
            )}
            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.xs }} />
            {row(t("seats.total"), price(total), true)}
          </Card>
        )}

        {session && <Text variant="small">{t("checkout.sendTo", { email: session.user.email })}</Text>}
        <Button
          title={t("seats.payDeclined")}
          variant="ghost"
          disabled={holdLost || pay.isPending}
          onPress={() => pay.mutate("decline")}
        />
      </Screen>
      <BottomBar>
        <Button
          title={t("seats.pay", { amount: price(total) })}
          disabled={holdLost || !session}
          loading={pay.isPending && pay.variables === "success"}
          onPress={() => pay.mutate("success")}
        />
      </BottomBar>
    </View>
  );
}

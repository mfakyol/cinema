import { groupBy, type Product, type ProductCategory } from "@sinema/shared";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { useLocale, useTranslations } from "use-intl";
import { LoadError } from "@/components/load-error";
import { PurchaseSteps } from "@/components/purchase-steps";
import { QuantityStepper } from "@/components/quantity-stepper";
import { BottomBar, Button, Card, Loading, Notice, Screen, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { usePrice } from "@/lib/format";
import { spacing, useColors } from "@/lib/theme";
import { useSeatHold } from "@/lib/use-seat-hold";

/** Glasses lead on 3D showings; the API only lists them for those. */
const CATEGORY_ORDER: ProductCategory[] = ["GLASSES", "COMBO", "SNACK", "DRINK"];

/** Step 2 of 3: snacks, drinks and, for 3D, glasses. Optional. */
export default function ExtrasStep() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const locale = useLocale() as "en" | "tr";
  const price = usePrice();
  const colors = useColors();
  const { seatMap, mine, remaining } = useSeatHold(id);
  const cart = useCart(id);
  const products = useQuery({
    queryKey: ["products", id],
    queryFn: () => api.fetch<{ products: Product[] }>(`/products?showtimeId=${id}`),
  });

  if (products.isError) {
    return (
      <Screen>
        <LoadError onRetry={() => void products.refetch()} />
      </Screen>
    );
  }
  if (!products.data || !seatMap.data) return <Loading />;

  const groups = groupBy(products.data.products, (product) => product.category);
  const itemsTotal = products.data.products.reduce(
    (sum, product) => sum + product.price * (cart.quantities.get(product.id) ?? 0),
    0,
  );
  const holdLost = mine.length === 0;

  const productRow = (product: Product) => (
    <View key={product.id} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontWeight: "600" }}>{product.name[locale]}</Text>
        {product.description && <Text variant="small">{product.description[locale]}</Text>}
        <Text variant="small" style={{ color: colors.foreground }}>
          {price(product.price)}
        </Text>
      </View>
      <QuantityStepper
        name={product.name[locale]}
        quantity={cart.quantities.get(product.id) ?? 0}
        onChange={(quantity) => cart.setQuantity(product.id, quantity)}
      />
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <PurchaseSteps current="extras" remaining={remaining} />
        <View style={{ gap: spacing.xs }}>
          <Text variant="title">{t("extras.title")}</Text>
          <Text variant="muted">{t("extras.subtitle")}</Text>
        </View>

        {holdLost && (
          <Notice
            text={t("checkout.holdLost")}
            action={<Button title={t("checkout.backToSeats")} variant="outline" onPress={() => router.back()} />}
          />
        )}

        {CATEGORY_ORDER.filter((category) => groups.has(category)).map((category) => {
          const list = groups.get(category)!;
          const glasses = category === "GLASSES";
          return (
            <Card key={category} style={glasses ? { borderColor: colors.primary, borderWidth: 1 } : undefined}>
              <Text variant="heading">{t(`extras.categories.${category}`)}</Text>
              {glasses && <Text variant="small">{t("extras.glassesHint")}</Text>}
              {list.map(productRow)}
              {glasses && list[0] && mine.length > 0 && (
                <Button
                  title={t("extras.onePerSeat", { count: mine.length })}
                  variant="outline"
                  onPress={() => cart.setQuantity(list[0]!.id, mine.length)}
                />
              )}
            </Card>
          );
        })}
      </Screen>
      <BottomBar>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text variant="muted">{t("extras.itemsTotal")}</Text>
          <Text style={{ fontWeight: "700" }}>{price(itemsTotal)}</Text>
        </View>
        <Button
          title={cart.quantities.size > 0 ? t("steps.continue") : t("steps.skip")}
          disabled={holdLost}
          onPress={() => router.push(`/showtimes/${id}/checkout`)}
        />
      </BottomBar>
    </View>
  );
}

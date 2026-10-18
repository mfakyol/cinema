"use client";

import { groupBy, type ProductCategory } from "@sinema/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { LoadError } from "@/components/load-error";
import { QuantityStepper } from "@/components/quantity-stepper";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { productsQuery } from "@/lib/basket";
import { useCart } from "@/lib/cart";
import { usePrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PurchaseSteps } from "../purchase-steps";
import { ShowtimeHeader } from "@/components/showtime-header";
import { useSeatHold } from "@/lib/use-seat-hold";

/** Glasses lead on 3D showings; the API only lists them for those. */
const CATEGORY_ORDER: ProductCategory[] = ["GLASSES", "COMBO", "SNACK", "DRINK"];

/** Step 2 of 3: snacks, drinks and, for 3D, glasses. Optional. */
export function ExtrasStep({ id }: { id: string }) {
  const t = useTranslations();
  const locale = useLocale() as "en" | "tr";
  const price = usePrice();
  const { seatMap, mine, remaining } = useSeatHold(id);
  const cart = useCart(id);
  const products = useQuery(productsQuery(id));

  if (products.isError) return <LoadError onRetry={() => void products.refetch()} />;
  if (!products.data || !seatMap.data) return <Skeleton className="h-96 w-full" />;

  const groups = groupBy(products.data.products, (product) => product.category);
  const itemsTotal = products.data.products.reduce(
    (sum, product) => sum + product.price * (cart.quantities.get(product.id) ?? 0),
    0,
  );
  const holdLost = mine.length === 0;

  return (
    <div className="space-y-6">
      <PurchaseSteps current="extras" remaining={remaining} />
      <ShowtimeHeader showtime={seatMap.data.showtime} />
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{t("extras.title")}</h2>
        <p className="text-muted-foreground">{t("extras.subtitle")}</p>
      </div>

      {holdLost && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-4">
            {t("checkout.holdLost")}
            <Button variant="outline" size="sm" asChild>
              <Link href={`/showtimes/${id}`}>{t("checkout.backToSeats")}</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-8 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          {CATEGORY_ORDER.filter((category) => groups.has(category)).map((category) => {
            const list = groups.get(category)!;
            const glasses = category === "GLASSES";
            return (
              <Card key={category} className={cn(glasses && "border-primary")}>
                <CardHeader>
                  <CardTitle>{t(`extras.categories.${category}`)}</CardTitle>
                  {glasses && <CardDescription>{t("extras.glassesHint")}</CardDescription>}
                </CardHeader>
                <CardContent className="space-y-4">
                  {list.map((product) => (
                    <div key={product.id} className="flex items-center gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{product.name[locale]}</p>
                        {product.description && (
                          <p className="text-sm text-muted-foreground">{product.description[locale]}</p>
                        )}
                        <p className="text-sm">{price(product.price)}</p>
                      </div>
                      <QuantityStepper
                        name={product.name[locale]}
                        quantity={cart.quantities.get(product.id) ?? 0}
                        onChange={(quantity) => cart.setQuantity(product.id, quantity)}
                      />
                    </div>
                  ))}
                  {glasses && list[0] && mine.length > 0 && (
                    <Button variant="outline" onClick={() => cart.setQuantity(list[0]!.id, mine.length)}>
                      {t("extras.onePerSeat", { count: mine.length })}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="lg:sticky lg:top-20">
          <CardContent className="space-y-4 pt-6">
            <div className="flex justify-between font-semibold">
              <span>{t("extras.itemsTotal")}</span>
              <span>{price(itemsTotal)}</span>
            </div>
            <Separator />
            {holdLost ? (
              <Button className="w-full" size="lg" disabled>
                {t("steps.continue")}
              </Button>
            ) : (
              <Button className="w-full" size="lg" asChild>
                <Link href={`/showtimes/${id}/checkout`}>
                  {cart.quantities.size > 0 ? t("steps.continue") : t("steps.skip")}
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

"use client";

import { checkoutSchema } from "@sinema/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { type Order, postJson } from "@/lib/api";
import { productsQuery } from "@/lib/basket";
import { useCart } from "@/lib/cart";
import { useErrorMessage, usePrice } from "@/lib/format";
import { useSession } from "@/lib/session";
import { PurchaseSteps } from "../purchase-steps";
import { ShowtimeHeader } from "@/components/showtime-header";
import { useSeatHold } from "@/lib/use-seat-hold";

/** Step 3 of 3: the basket (tickets and items), the email for the tickets, and payment. */
export function CheckoutStep({ id }: { id: string }) {
  const t = useTranslations();
  const locale = useLocale() as "en" | "tr";
  const price = usePrice();
  const errorMessage = useErrorMessage();
  const session = useSession();
  const queryClient = useQueryClient();
  const { seatMap, mine, remaining, refresh } = useSeatHold(id);
  const cart = useCart(id);
  // Same query as the snacks step, so this is read from the cache.
  const products = useQuery(productsQuery(id));
  const [purchased, setPurchased] = useState<Order | null>(null);
  // Starts as the signed-in user's address; guests type theirs.
  const [emailInput, setEmailInput] = useState<string | null>(null);
  const email = emailInput ?? session?.user?.email ?? "";
  const emailValid = checkoutSchema.shape.email.safeParse(email).success;

  const lines = (products.data?.products ?? [])
    .filter((product) => cart.quantities.has(product.id))
    .map((product) => ({ product, quantity: cart.quantities.get(product.id)! }));

  const pay = useMutation({
    mutationFn: (simulate: "success" | "decline") =>
      postJson<{ order: Order }>("/checkout", {
        showtimeId: id,
        idempotencyKey: crypto.randomUUID(),
        channel: "WEB",
        email,
        locale,
        items: lines.map(({ product, quantity }) => ({ productId: product.id, quantity })),
        simulate,
      }),
    onSuccess: ({ order }) => {
      setPurchased(order);
      cart.clear();
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: refresh,
  });

  if (!seatMap.data || products.isPending) return <Skeleton className="h-96 w-full" />;
  const { showtime } = seatMap.data;

  if (purchased) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CircleCheck className="size-8 text-primary" aria-hidden />
          <CardTitle>{t("seats.purchased")}</CardTitle>
          <CardDescription>
            {t("seats.ticketCount", { count: purchased.tickets.length })} · {price(purchased.amount)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("order.sentTo", { email: purchased.contactEmail ?? email })}</p>
          <Button className="w-full" asChild>
            <Link href={`/orders/${purchased.accessToken}`}>{t("seats.viewTickets")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const itemsTotal = lines.reduce((sum, { product, quantity }) => sum + product.price * quantity, 0);
  const total = showtime.price * mine.length + itemsTotal;
  const holdLost = mine.length === 0;
  const row = (left: string, right: string) => (
    <div className="flex justify-between gap-4 text-sm">
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <PurchaseSteps current="payment" remaining={remaining} />
      <ShowtimeHeader showtime={showtime} />
      <h2 className="text-xl font-semibold">{t("checkout.title")}</h2>

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

      <div className="grid items-start gap-8 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <h3 className="font-semibold">{t("checkout.tickets")}</h3>
            {mine.map((seat) => (
              <div key={seat.id}>{row(t("seats.seatLabel", { row: seat.row, number: seat.number }), price(showtime.price))}</div>
            ))}
            {showtime.discount && (
              <p className="text-sm font-semibold text-green-600 dark:text-green-400">
                {t(`discounts.${showtime.discount.kind}`, { percent: showtime.discount.percent })} ·{" "}
                <s className="font-normal text-muted-foreground">{price(showtime.basePrice)}</s>
              </p>
            )}
            {lines.length > 0 && (
              <>
                <h3 className="pt-2 font-semibold">{t("checkout.items")}</h3>
                {lines.map(({ product, quantity }) => (
                  <div key={product.id} className="space-y-0.5">
                    {row(product.name[locale], price(product.price * quantity))}
                    <p className="text-xs text-muted-foreground">
                      {t("checkout.lineQuantity", { count: quantity, price: price(product.price) })}
                    </p>
                  </div>
                ))}
              </>
            )}
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>{t("seats.total")}</span>
              <span>{price(total)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:sticky lg:top-20">
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label htmlFor="checkout-email">{t("order.email")}</Label>
              <Input
                id="checkout-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmailInput(event.target.value)}
                aria-describedby="checkout-email-hint"
                aria-invalid={(email !== "" && !emailValid) || undefined}
              />
              <p id="checkout-email-hint" className="text-xs text-muted-foreground">
                {t("order.emailHint")}
              </p>
            </div>
            <Button
              className="w-full"
              size="lg"
              disabled={holdLost || !emailValid || pay.isPending}
              onClick={() => pay.mutate("success")}
            >
              {t("seats.pay", { amount: price(total) })}
            </Button>
            <Button
              variant="link"
              size="sm"
              className="w-full text-muted-foreground"
              disabled={holdLost || !emailValid || pay.isPending}
              onClick={() => pay.mutate("decline")}
            >
              {t("seats.payDeclined")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

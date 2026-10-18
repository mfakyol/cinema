"use client";

import { checkoutSchema, groupBy, type ProductCategory } from "@sinema/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Banknote, CircleCheck, CreditCard } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { LoadError } from "@/components/load-error";
import { QuantityStepper } from "@/components/quantity-stepper";
import { SeatGrid } from "@/components/seat-grid";
import { ShowtimeHeader } from "@/components/showtime-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, type Order, postJson, type SeatMapSeat } from "@/lib/api";
import { basket, productsQuery } from "@/lib/basket";
import { useCart } from "@/lib/cart";
import { useErrorMessage, usePrice } from "@/lib/format";
import { formatRemaining } from "@/lib/use-countdown";
import { useSeatHold } from "@/lib/use-seat-hold";
import { cn } from "@/lib/utils";

const CATEGORY_ORDER: ProductCategory[] = ["GLASSES", "COMBO", "SNACK", "DRINK"];
type Payment = "CARD" | "CASH";

/** Seats, snacks and payment for one showtime, all on one screen for speed at the counter. */
export function SaleDesk({
  showtimeId,
  sold,
  onSold,
  onNewSale,
}: {
  showtimeId: string;
  sold: Order | null;
  onSold: (order: Order) => void;
  onNewSale: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as "en" | "tr";
  const price = usePrice();
  const errorMessage = useErrorMessage();
  const { seatMap, mine, remaining, live, refresh } = useSeatHold(showtimeId);
  const cart = useCart(showtimeId);
  const products = useQuery(productsQuery(showtimeId));
  const [email, setEmail] = useState("");
  const [payment, setPayment] = useState<Payment>("CARD");
  const emailValid = email === "" || checkoutSchema.shape.email.safeParse(email).success;

  const toggleSeat = useMutation({
    mutationFn: (seat: SeatMapSeat) =>
      seat.lockId
        ? apiFetch<void>(`/locks/${seat.lockId}`, { method: "DELETE" })
        : postJson(`/showtimes/${showtimeId}/locks`, { seatIds: [seat.id] }),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: refresh,
  });

  const clear = useMutation({
    mutationFn: () =>
      Promise.all(mine.map((seat) => apiFetch<void>(`/locks/${seat.lockId}`, { method: "DELETE" }))),
    onSuccess: () => {
      cart.clear();
      setEmail("");
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: refresh,
  });

  if (seatMap.isError) return <LoadError onRetry={() => void seatMap.refetch()} />;
  if (!seatMap.data) return <Skeleton className="h-[32rem] w-full" />;
  const { showtime, seats, columns } = seatMap.data;
  const { lines, total } = basket(products.data?.products, cart.quantities, showtime.price, mine.length);

  const charge = (simulate: "success" | "decline") =>
    postJson<{ order: Order }>("/checkout/kiosk", {
      showtimeId,
      idempotencyKey: crypto.randomUUID(),
      email: email || undefined,
      locale,
      items: lines.map(({ product, quantity }) => ({ productId: product.id, quantity })),
      payment,
      simulate,
    });

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-6">
        <ShowtimeHeader showtime={showtime} live={live} />
        <Card>
          <CardContent className="pt-6">
            <SeatGrid
              seats={seats}
              columns={columns}
              busySeatId={toggleSeat.isPending ? toggleSeat.variables.id : null}
              onToggle={sold ? undefined : (seat) => toggleSeat.mutate(seat)}
            />
            <p className="mt-4 text-center text-sm text-muted-foreground">{t("kiosk.seatsHint")}</p>
          </CardContent>
        </Card>
        {!sold && products.data && <Products showtimeId={showtimeId} seatCount={mine.length} />}
      </div>

      {sold ? (
        <SoldCard order={sold} onNewSale={onNewSale} />
      ) : (
        <Card className="xl:sticky xl:top-0">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t("kiosk.basket")}</CardTitle>
            {remaining !== null && (
              <span className="text-sm tabular-nums text-muted-foreground">
                {t("seats.heldFor", { time: formatRemaining(remaining) })}
              </span>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {mine.length === 0 && <p className="text-sm text-muted-foreground">{t("kiosk.emptyBasket")}</p>}
            {mine.length > 0 && (
              <ul className="space-y-1 text-sm">
                {mine.map((seat) => (
                  <li key={seat.id} className="flex justify-between gap-4">
                    <span>{t("seats.seatLabel", { row: seat.row, number: seat.number })}</span>
                    <span>{price(showtime.price)}</span>
                  </li>
                ))}
                {lines.map(({ product, quantity }) => (
                  <li key={product.id} className="flex justify-between gap-4">
                    <span>
                      {quantity} × {product.name[locale]}
                    </span>
                    <span>{price(product.price * quantity)}</span>
                  </li>
                ))}
              </ul>
            )}
            {showtime.discount && mine.length > 0 && (
              <p className="text-sm font-semibold text-green-600 dark:text-green-400">
                {t(`discounts.${showtime.discount.kind}`, { percent: showtime.discount.percent })}
              </p>
            )}
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span>{t("seats.total")}</span>
              <span>{price(total)}</span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="kiosk-email">{t("kiosk.email")}</Label>
              <Input
                id="kiosk-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-describedby="kiosk-email-hint"
                aria-invalid={!emailValid || undefined}
              />
              <p id="kiosk-email-hint" className="text-xs text-muted-foreground">
                {t("kiosk.emailHint")}
              </p>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t("kiosk.payment")}</legend>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["CARD", CreditCard],
                    ["CASH", Banknote],
                  ] as const
                ).map(([method, Icon]) => (
                  <Button
                    key={method}
                    type="button"
                    variant={payment === method ? "default" : "outline"}
                    aria-pressed={payment === method}
                    onClick={() => setPayment(method)}
                  >
                    <Icon aria-hidden />
                    {t(method === "CARD" ? "kiosk.card" : "kiosk.cash")}
                  </Button>
                ))}
              </div>
            </fieldset>

            <PayButtons
              disabled={mine.length === 0 || !emailValid || clear.isPending}
              payment={payment}
              total={total}
              charge={charge}
              onSold={(order) => {
                cart.clear();
                setEmail("");
                onSold(order);
              }}
              onSettled={refresh}
            />
            <Button
              variant="ghost"
              className="w-full"
              disabled={(mine.length === 0 && cart.quantities.size === 0) || clear.isPending}
              onClick={() => clear.mutate()}
            >
              {t("kiosk.clear")}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PayButtons({
  disabled,
  payment,
  total,
  charge,
  onSold,
  onSettled,
}: {
  disabled: boolean;
  payment: Payment;
  total: number;
  charge: (simulate: "success" | "decline") => Promise<{ order: Order }>;
  onSold: (order: Order) => void;
  onSettled: () => void;
}) {
  const t = useTranslations();
  const price = usePrice();
  const errorMessage = useErrorMessage();
  const pay = useMutation({
    mutationFn: charge,
    onSuccess: ({ order }) => onSold(order),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled,
  });
  return (
    <>
      <Button className="w-full" size="lg" disabled={disabled || pay.isPending} onClick={() => pay.mutate("success")}>
        {t("kiosk.charge", { amount: price(total) })}
      </Button>
      {payment === "CARD" && (
        <Button
          variant="link"
          size="sm"
          className="w-full text-muted-foreground"
          disabled={disabled || pay.isPending}
          onClick={() => pay.mutate("decline")}
        >
          {t("seats.payDeclined")}
        </Button>
      )}
    </>
  );
}

/** Snacks, drinks and, for 3D, glasses; glasses first with a one-per-seat shortcut. */
function Products({ showtimeId, seatCount }: { showtimeId: string; seatCount: number }) {
  const t = useTranslations();
  const locale = useLocale() as "en" | "tr";
  const price = usePrice();
  const cart = useCart(showtimeId);
  const products = useQuery(productsQuery(showtimeId));
  if (!products.data) return null;
  const groups = groupBy(products.data.products, (product) => product.category);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {CATEGORY_ORDER.filter((category) => groups.has(category)).map((category) => {
        const list = groups.get(category)!;
        const glasses = category === "GLASSES";
        return (
          <Card key={category} className={cn("gap-3", glasses && "border-primary md:col-span-2")}>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">{t(`extras.categories.${category}`)}</CardTitle>
              {glasses && seatCount > 0 && (
                <Button variant="outline" size="sm" onClick={() => cart.setQuantity(list[0]!.id, seatCount)}>
                  {t("extras.onePerSeat", { count: seatCount })}
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {list.map((product) => (
                <div key={product.id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{product.name[locale]}</p>
                    <p className="text-xs text-muted-foreground">{price(product.price)}</p>
                  </div>
                  <QuantityStepper
                    name={product.name[locale]}
                    quantity={cart.quantities.get(product.id) ?? 0}
                    onChange={(quantity) => cart.setQuantity(product.id, quantity)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function SoldCard({ order, onNewSale }: { order: Order; onNewSale: () => void }) {
  const t = useTranslations();
  const price = usePrice();
  return (
    <Card className="xl:sticky xl:top-0">
      <CardHeader>
        <CircleCheck className="size-8 text-primary" aria-hidden />
        <CardTitle>{t("kiosk.sold")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t("kiosk.soldDetail", {
            tickets: t("seats.ticketCount", { count: order.tickets.length }),
            amount: price(order.amount),
            method: t(order.paymentMethod === "CASH" ? "kiosk.cash" : "kiosk.card"),
          })}
        </p>
        <p className="text-sm">{t("kiosk.displayLinked")}</p>
        <Button className="w-full" size="lg" onClick={onNewSale}>
          {t("kiosk.newSale")}
        </Button>
      </CardContent>
    </Card>
  );
}

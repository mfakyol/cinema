"use client";

import { useQuery } from "@tanstack/react-query";
import { Clapperboard } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { SeatGrid } from "@/components/seat-grid";
import { ShowtimeHeader } from "@/components/showtime-header";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, type OrderPage } from "@/lib/api";
import { basket, productsQuery } from "@/lib/basket";
import { usePrice } from "@/lib/format";
import { useKioskState } from "@/lib/kiosk-sync";
import { siteUrl } from "@/lib/site";
import { formatRemaining } from "@/lib/use-countdown";
import { useSeatHold } from "@/lib/use-seat-hold";

/**
 * What the customer sees across the counter: a welcome, then their seats and basket as staff
 * pick them, then a QR code that puts the tickets on their phone.
 */
export function CustomerDisplay() {
  const state = useKioskState();
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 lg:p-10">
      {state?.orderToken ? (
        <Receipt token={state.orderToken} />
      ) : state?.showtimeId ? (
        <Basket showtimeId={state.showtimeId} items={state.items} />
      ) : (
        <Welcome />
      )}
    </div>
  );
}

function Welcome() {
  const t = useTranslations("kiosk.display");
  return (
    <div className="m-auto space-y-4 text-center">
      <Clapperboard className="mx-auto size-16 text-primary" aria-hidden />
      <h1 className="text-4xl font-bold tracking-tight lg:text-6xl">{t("welcome")}</h1>
      <p className="text-lg text-muted-foreground lg:text-xl">{t("welcomeSubtitle")}</p>
    </div>
  );
}

function Basket({ showtimeId, items }: { showtimeId: string; items: [string, number][] }) {
  const t = useTranslations();
  const locale = useLocale() as "en" | "tr";
  const price = usePrice();
  // Signed in as the same staff member, so the seats held at the counter show as "your seats".
  const { seatMap, mine, remaining } = useSeatHold(showtimeId);
  const products = useQuery(productsQuery(showtimeId));

  if (!seatMap.data) return <Skeleton className="h-full w-full" />;
  const { showtime, seats, columns } = seatMap.data;
  const { lines, total } = basket(products.data?.products, new Map(items), showtime.price, mine.length);

  return (
    <div className="grid flex-1 items-start gap-8 lg:grid-cols-[1fr_400px]">
      <div className="space-y-6">
        <ShowtimeHeader showtime={showtime} />
        <Card>
          <CardContent className="pt-6">
            <SeatGrid seats={seats} columns={columns} />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardContent className="space-y-4 pt-6 text-lg">
          {mine.map((seat) => (
            <div key={seat.id} className="flex justify-between gap-4">
              <span>{t("seats.seatLabel", { row: seat.row, number: seat.number })}</span>
              <span>{price(showtime.price)}</span>
            </div>
          ))}
          {lines.map(({ product, quantity }) => (
            <div key={product.id} className="flex justify-between gap-4">
              <span>
                {quantity} × {product.name[locale]}
              </span>
              <span>{price(product.price * quantity)}</span>
            </div>
          ))}
          {showtime.discount && mine.length > 0 && (
            <p className="text-base font-semibold text-green-600 dark:text-green-400">
              {t(`discounts.${showtime.discount.kind}`, { percent: showtime.discount.percent })}
            </p>
          )}
          <Separator />
          <div className="flex justify-between text-3xl font-bold">
            <span>{t("seats.total")}</span>
            <span>{price(total)}</span>
          </div>
          {remaining !== null && (
            <p className="text-sm tabular-nums text-muted-foreground">
              {t("seats.heldFor", { time: formatRemaining(remaining) })}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Receipt({ token }: { token: string }) {
  const t = useTranslations();
  const locale = useLocale() as "en" | "tr";
  const order = useQuery({
    queryKey: ["order", token],
    queryFn: () => apiFetch<{ order: OrderPage }>(`/orders/${encodeURIComponent(token)}`),
  });
  if (!order.data) return <Skeleton className="m-auto h-96 w-full max-w-md" />;
  const { tickets, vouchers, email } = order.data.order;

  return (
    <div className="m-auto grid w-full max-w-4xl items-center gap-10 md:grid-cols-[auto_1fr]">
      {/* Black on white in both themes so phone cameras can read it. */}
      <div className="mx-auto rounded-xl bg-white p-4">
        <QRCodeSVG value={`${siteUrl()}/orders/${token}`} size={280} aria-label={t("kiosk.display.scanForTickets")} />
      </div>
      <div className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight lg:text-5xl">{t("kiosk.display.thanks")}</h1>
        <p className="text-xl">{t("kiosk.display.scanForTickets")}</p>
        {email && <p className="text-muted-foreground">{t("kiosk.display.emailed", { email })}</p>}
        <ul className="space-y-1 text-lg">
          {tickets[0] && (
            <li className="font-semibold">
              {tickets[0].showtime.movie.title} · {tickets[0].showtime.hall.name}
            </li>
          )}
          {tickets.map((ticket) => (
            <li key={ticket.id}>{t("seats.seatLabel", { row: ticket.seat.row, number: ticket.seat.number })}</li>
          ))}
          {vouchers.map((voucher) => (
            <li key={voucher.id} className="text-muted-foreground">
              {voucher.product.name[locale]}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

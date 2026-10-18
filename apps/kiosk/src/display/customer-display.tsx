import type { OrderPage, SeatMapSeat } from "@sinema/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Clapperboard } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect } from "react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "use-intl";
import { SeatGrid } from "@/components/seat-grid";
import { ShowtimeHeader } from "@/components/showtime-header";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { api, SITE_URL } from "@/lib/api";
import { basket, productsQuery } from "@/lib/basket";
import { useErrorMessage, usePrice } from "@/lib/format";
import { useKioskState } from "@/lib/kiosk-sync";
import { formatRemaining } from "@/lib/use-countdown";
import { useSeatHold } from "@/lib/use-seat-hold";

/**
 * What the customer sees across the counter: a welcome, then their seats and basket as staff
 * pick them, then a QR code that puts the tickets on their phone.
 */
export function CustomerDisplay() {
  const t = useTranslations();
  const state = useKioskState();

  useEffect(() => {
    document.title = `${t("kiosk.display.title")} · ${t("common.appName")}`;
  }, [t]);

  return (
    <div className="flex h-dvh flex-col overflow-y-auto p-6 [scrollbar-gutter:stable] lg:p-8">
      {state?.orderToken ? (
        <Receipt key={state.orderToken} token={state.orderToken} />
      ) : state?.showtimeId ? (
        <Basket showtimeId={state.showtimeId} items={state.items} canPickSeats={state.step === "seats"} />
      ) : (
        <Welcome />
      )}
    </div>
  );
}

function Welcome() {
  const t = useTranslations("kiosk.display");
  return (
    <div className="m-auto animate-in space-y-4 text-center duration-500 fade-in">
      <Clapperboard className="mx-auto size-16 text-primary" aria-hidden />
      <h1 className="text-4xl font-bold tracking-tight lg:text-6xl">{t("welcome")}</h1>
      <p className="text-lg text-muted-foreground lg:text-xl">{t("welcomeSubtitle")}</p>
    </div>
  );
}

function Basket({
  showtimeId,
  items,
  canPickSeats,
}: {
  showtimeId: string;
  items: [string, number][];
  canPickSeats: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale() as "en" | "tr";
  const price = usePrice();
  const errorMessage = useErrorMessage();
  // Signed in as the same staff member, so the seats held at the counter show as "your seats",
  // and seats tapped here are held for the same sale.
  const { seatMap, mine, remaining, refresh } = useSeatHold(showtimeId);
  const products = useQuery(productsQuery(showtimeId));
  const toggleSeat = useMutation({
    mutationFn: (seat: SeatMapSeat) =>
      seat.lockId
        ? api.fetch<void>(`/locks/${seat.lockId}`, { method: "DELETE" })
        : api.post(`/showtimes/${showtimeId}/locks`, { seatIds: [seat.id] }),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: refresh,
  });

  if (!seatMap.data) return <Skeleton className="h-full w-full" />;
  const { showtime, seats, columns } = seatMap.data;
  const { lines, total } = basket(products.data?.products, new Map(items), showtime.price, mine.length);

  // While staff are on the seats step the whole screen is the seat map, for the customer to tap.
  if (canPickSeats) {
    return (
      <div className="flex min-h-0 flex-1 animate-in flex-col gap-4 duration-500 fade-in">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <ShowtimeHeader showtime={showtime} />
          <p className="text-xl font-semibold text-primary">{t("kiosk.display.pickSeats")}</p>
        </div>
        <div className="min-h-0 flex-1">
          <SeatGrid
            fill
            seats={seats}
            columns={columns}
            busySeatId={toggleSeat.isPending ? toggleSeat.variables.id : null}
            onToggle={(seat) => toggleSeat.mutate(seat)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="grid flex-1 animate-in items-start gap-8 duration-500 fade-in lg:grid-cols-[1fr_420px]">
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
              <span className="tabular-nums">{price(showtime.price)}</span>
            </div>
          ))}
          {lines.map(({ product, quantity }) => (
            <div key={product.id} className="flex justify-between gap-4">
              <span>
                {quantity} × {product.name[locale]}
              </span>
              <span className="tabular-nums">{price(product.price * quantity)}</span>
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
            <span className="tabular-nums">{price(total)}</span>
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
    queryFn: () => api.fetch<{ order: OrderPage }>(`/orders/${encodeURIComponent(token)}`),
  });
  if (!order.data) return <Skeleton className="m-auto h-96 w-full max-w-md" />;
  const { tickets, vouchers, email } = order.data.order;

  return (
    <div className="m-auto grid w-full max-w-4xl animate-in items-center gap-10 duration-500 fade-in zoom-in-95 md:grid-cols-[auto_1fr]">
      {/* Black on white in both themes so phone cameras can read it. */}
      <div className="mx-auto rounded-xl bg-white p-4">
        <QRCodeSVG value={`${SITE_URL}/orders/${token}`} size={280} aria-label={t("kiosk.display.scanForTickets")} />
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

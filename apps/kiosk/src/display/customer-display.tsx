import type { OrderPage, SeatMapSeat } from "@sinema/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Clapperboard } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
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
import { cn } from "@/lib/utils";

/**
 * What the customer sees across the counter: a welcome, then their seats and basket as staff
 * pick them, then a QR code that puts the tickets on their phone.
 */
export function CustomerDisplay() {
  const state = useKioskState();

  return (
    <div className="flex h-dvh flex-col overflow-y-auto p-6 lg:p-8">
      {!state || state.locked ? (
        <Closed />
      ) : state?.orderToken ? (
        <Receipt key={state.orderToken} token={state.orderToken} />
      ) : state?.showtimeId ? (
        <Basket showtimeId={state.showtimeId} items={state.items} canPickSeats={state.step === "seats"} />
      ) : (
        <Welcome />
      )}
    </div>
  );
}

/** The cinema's mark: the clapperboard and the name. */
function Logo() {
  const t = useTranslations("common");
  return (
    <div className="flex flex-col items-center gap-4">
      <Clapperboard className="size-24 text-primary" strokeWidth={1.5} aria-hidden />
      <p className="text-5xl font-bold tracking-tight">{t("appName")}</p>
    </div>
  );
}

/** Locked, or nobody signed in at the counter: just the logo. */
function Closed() {
  return (
    <div className="m-auto text-muted-foreground">
      <Logo />
    </div>
  );
}

/** Open and waiting for the next customer. */
function Welcome() {
  const t = useTranslations("kiosk.display");
  return (
    <div className="m-auto flex flex-col items-center gap-6">
      <Logo />
      <h1 className="text-3xl font-medium text-muted-foreground lg:text-4xl">{t("welcome")}</h1>
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <ShowtimeHeader showtime={showtime} />
        <p
          className={cn("text-xl font-semibold text-primary", !canPickSeats && "invisible")}
          aria-hidden={!canPickSeats}
        >
          {t("kiosk.display.pickSeats")}
        </p>
      </div>
      {canPickSeats ? (
        // The seats step: the whole screen is the hall, for the customer to tap. No totals.
        <div className="min-h-0 flex-1">
          <SeatGrid
            fill
            seats={seats}
            columns={columns}
            busySeatId={toggleSeat.isPending ? toggleSeat.variables.id : null}
            onToggle={(seat) => toggleSeat.mutate(seat)}
          />
        </div>
      ) : (
        // Snacks and payment: the order summary in place of the map.
        <Card className="mx-auto w-full max-w-2xl">
          <CardContent className="space-y-4 pt-2 text-2xl">
            <h2 className="text-lg font-medium text-muted-foreground">{t("kiosk.summary")}</h2>
            {mine.map((seat) => (
              <div key={seat.id} className="flex justify-between gap-4">
                <span>{t("seats.seatLabel", { row: seat.row, number: seat.number })}</span>
                <span className="tabular-nums">{price(showtime.price)}</span>
              </div>
            ))}
            {showtime.discount && mine.length > 0 && (
              <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                {t(`discounts.${showtime.discount.kind}`, { percent: showtime.discount.percent })}
              </p>
            )}
            {lines.map(({ product, quantity }) => (
              <div key={product.id} className="flex justify-between gap-4">
                <span>
                  {quantity} × {product.name[locale]}
                </span>
                <span className="tabular-nums">{price(product.price * quantity)}</span>
              </div>
            ))}
            <Separator />
            <div className="flex justify-between text-4xl font-bold">
              <span>{t("seats.total")}</span>
              <span className="tabular-nums">{price(total)}</span>
            </div>
            {remaining !== null && (
              <p className="text-base tabular-nums text-muted-foreground">
                {t("seats.heldFor", { time: formatRemaining(remaining) })}
              </p>
            )}
          </CardContent>
        </Card>
      )}
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
    <div className="m-auto grid w-full max-w-4xl items-center gap-10 md:grid-cols-[auto_1fr]">
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

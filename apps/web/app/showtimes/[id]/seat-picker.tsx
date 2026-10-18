"use client";

import { checkoutSchema } from "@sinema/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CircleCheck, Clock, Radio } from "lucide-react";
import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { LoadError } from "@/components/load-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, type Order, postJson, type SeatMap, type SeatMapSeat } from "@/lib/api";
import { useErrorMessage, usePrice } from "@/lib/format";
import { useLiveSeatMap } from "@/lib/realtime";
import { ensureSessionToken, useSession } from "@/lib/session";
import { SeatGrid } from "./seat-grid";
import { formatRemaining, useCountdown } from "./use-countdown";

export function SeatPicker({ id }: { id: string }) {
  const t = useTranslations();
  const format = useFormatter();
  const price = usePrice();
  const errorMessage = useErrorMessage();
  const session = useSession();
  const queryClient = useQueryClient();
  const locale = useLocale();
  const [purchased, setPurchased] = useState<Order | null>(null);
  // Starts as the signed-in user's address; guests type theirs.
  const [emailInput, setEmailInput] = useState<string | null>(null);
  const email = emailInput ?? session?.user?.email ?? "";
  const emailValid = checkoutSchema.shape.email.safeParse(email).success;

  // Keyed by session so a new guest session or a sign-in refetches with the right "mine" flags.
  const queryKey = ["seats", id, session?.token ?? "anonymous"] as const;
  const seatMap = useQuery({
    queryKey,
    queryFn: () => apiFetch<SeatMap>(`/showtimes/${id}/seats`),
  });
  const live = useLiveSeatMap(id, queryKey);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["seats", id] });

  const toggleSeat = useMutation({
    mutationFn: async (seat: SeatMapSeat) => {
      if (seat.lockId) return apiFetch<void>(`/locks/${seat.lockId}`, { method: "DELETE" });
      // No account needed: the first seat tapped starts a guest session.
      await ensureSessionToken();
      return postJson(`/showtimes/${id}/locks`, { seatIds: [seat.id] });
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: refresh,
  });

  const pay = useMutation({
    mutationFn: (simulate: "success" | "decline") =>
      postJson<{ order: Order }>("/checkout", {
        showtimeId: id,
        idempotencyKey: crypto.randomUUID(),
        channel: "WEB",
        email,
        locale,
        simulate,
      }),
    onSuccess: ({ order }) => {
      setPurchased(order);
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: refresh,
  });

  const mine = seatMap.data?.seats.filter((seat) => seat.lockId) ?? [];
  const firstExpiry = mine
    .map((seat) => seat.lockExpiresAt!)
    .sort()
    .at(0);
  const remaining = useCountdown(firstExpiry, () => void refresh());

  if (seatMap.isError) return <LoadError onRetry={() => void seatMap.refetch()} />;
  if (seatMap.isPending) {
    return (
      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { showtime, seats } = seatMap.data;
  const startsAt = format.dateTime(new Date(showtime.startsAt), {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-3">
        <Link href={`/movies/${showtime.movie.id}`}>
          <ArrowLeft aria-hidden />
          {t("common.back")}
        </Link>
      </Button>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{showtime.movie.title}</h1>
          <p className="text-muted-foreground">
            {startsAt} · {showtime.hall.name}
          </p>
        </div>
        {live && (
          <Badge variant="outline" className="gap-1.5">
            <Radio className="size-3 text-primary" aria-hidden />
            {t("seats.live")}
          </Badge>
        )}
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[1fr_300px]">
        <Card>
          <CardContent className="pt-6">
            <SeatGrid
              seats={seats}
              busySeatId={toggleSeat.isPending ? toggleSeat.variables.id : null}
              onToggle={(seat) => toggleSeat.mutate(seat)}
            />
            <p className="mt-6 text-center text-sm text-muted-foreground">{t("seats.pickHint")}</p>
          </CardContent>
        </Card>

        <Card className="lg:sticky lg:top-20">
          {purchased ? (
            <>
              <CardHeader>
                <CircleCheck className="size-8 text-primary" aria-hidden />
                <CardTitle>{t("seats.purchased")}</CardTitle>
                <CardDescription>
                  {t("seats.ticketCount", { count: purchased.tickets.length })} · {price(purchased.amount)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t("order.sentTo", { email: purchased.contactEmail })}
                </p>
                <Button className="w-full" asChild>
                  <Link href={`/orders/${purchased.accessToken}`}>{t("seats.viewTickets")}</Link>
                </Button>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle>{t("seats.selected", { count: mine.length })}</CardTitle>
                {remaining !== null && (
                  <CardDescription className="flex items-center gap-1.5" aria-live="polite">
                    <Clock className="size-4" aria-hidden />
                    {t("seats.heldFor", { time: formatRemaining(remaining) })}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {mine.length > 0 && (
                  <ul className="space-y-1 text-sm">
                    {mine.map((seat) => (
                      <li key={seat.id} className="flex justify-between">
                        <span>{t("seats.seatLabel", { row: seat.row, number: seat.number })}</span>
                        <span className="text-muted-foreground">{price(showtime.price)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>{t("seats.total")}</span>
                  <span>{price(showtime.price * mine.length)}</span>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="checkout-email">{t("order.email")}</Label>
                  <Input
                    id="checkout-email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
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
                  disabled={mine.length === 0 || !emailValid || pay.isPending}
                  onClick={() => pay.mutate("success")}
                >
                  {t("seats.pay", { amount: price(showtime.price * mine.length) })}
                </Button>
                <Button
                  variant="link"
                  size="sm"
                  className="w-full text-muted-foreground"
                  disabled={mine.length === 0 || !emailValid || pay.isPending}
                  onClick={() => pay.mutate("decline")}
                >
                  {t("seats.payDeclined")}
                </Button>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

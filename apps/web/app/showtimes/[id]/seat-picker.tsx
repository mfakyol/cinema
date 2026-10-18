"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { LoadError } from "@/components/load-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, postJson, type SeatMapSeat } from "@/lib/api";
import { useErrorMessage, usePrice } from "@/lib/format";
import { ensureSessionToken } from "@/lib/session";
import { PurchaseSteps } from "./purchase-steps";
import { SeatGrid } from "./seat-grid";
import { ShowtimeHeader } from "./showtime-header";
import { useSeatHold } from "./use-seat-hold";

/** Step 1 of 3: pick seats on the live map. */
export function SeatPicker({ id }: { id: string }) {
  const t = useTranslations();
  const price = usePrice();
  const errorMessage = useErrorMessage();
  const { seatMap, mine, remaining, live, refresh } = useSeatHold(id);

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

  if (seatMap.isError) return <LoadError onRetry={() => void seatMap.refetch()} />;
  if (seatMap.isPending) {
    return (
      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { showtime, seats, columns } = seatMap.data;
  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-3">
        <Link href={`/movies/${showtime.movie.id}`}>
          <ArrowLeft aria-hidden />
          {t("common.back")}
        </Link>
      </Button>
      <PurchaseSteps current="seats" remaining={remaining} />
      <ShowtimeHeader showtime={showtime} live={live} />

      <div className="grid items-start gap-8 lg:grid-cols-[1fr_300px]">
        <Card>
          <CardContent className="pt-6">
            <SeatGrid
              seats={seats}
              columns={columns}
              busySeatId={toggleSeat.isPending ? toggleSeat.variables.id : null}
              onToggle={(seat) => toggleSeat.mutate(seat)}
            />
            <p className="mt-6 text-center text-sm text-muted-foreground">{t("seats.pickHint")}</p>
          </CardContent>
        </Card>

        <Card className="lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle>{t("seats.selected", { count: mine.length })}</CardTitle>
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
            {mine.length > 0 ? (
              <Button className="w-full" size="lg" asChild>
                <Link href={`/showtimes/${id}/extras`}>{t("steps.continue")}</Link>
              </Button>
            ) : (
              <Button className="w-full" size="lg" disabled>
                {t("steps.continue")}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

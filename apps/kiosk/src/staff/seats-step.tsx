import { MAX_LOCKS_PER_HOLDER, type SeatMapSeat } from "@sinema/shared";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";
import { SeatGrid } from "@/components/seat-grid";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { bestSeats } from "@/lib/best-seats";
import { useErrorMessage } from "@/lib/format";
import type { useSeatHold } from "@/lib/use-seat-hold";

const QUICK_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8];

/** The seat map, with a quick pick for groups and the held seats to let go of one by one. */
export function SeatsStep({ showtimeId, hold }: { showtimeId: string; hold: ReturnType<typeof useSeatHold> }) {
  const t = useTranslations();
  const errorMessage = useErrorMessage();
  const { seatMap, mine, refresh } = hold;

  const lock = useMutation({
    mutationFn: (seatIds: string[]) => api.post(`/showtimes/${showtimeId}/locks`, { seatIds }),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: refresh,
  });
  const release = useMutation({
    mutationFn: (seat: SeatMapSeat) => api.fetch<void>(`/locks/${seat.lockId}`, { method: "DELETE" }),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: refresh,
  });

  if (!seatMap.data) return null;
  const { seats, columns } = seatMap.data;
  const busy = lock.isPending || release.isPending;
  const seatLabel = (seat: SeatMapSeat) => t("seats.seatLabel", { row: seat.row, number: seat.number });

  const quickPick = (count: number) => {
    const block = bestSeats(seats, columns, count);
    if (!block) {
      toast.error(t("kiosk.noBlock", { count }));
      return;
    }
    lock.mutate(block.map((seat) => seat.id));
  };

  return (
    <div className="mx-auto grid h-full max-w-7xl gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="min-h-[60vh] lg:min-h-0">
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 pt-6">
          <div className="min-h-0 flex-1">
            <SeatGrid
              fill
              seats={seats}
              columns={columns}
              busySeatId={busy ? (lock.variables?.[0] ?? release.variables?.id ?? "") : null}
              onToggle={(seat) => (seat.lockId ? release.mutate(seat) : lock.mutate([seat.id]))}
            />
          </div>
          <p className="text-center text-sm text-muted-foreground">{t("kiosk.seatsHint")}</p>
        </CardContent>
      </Card>

      <div className="space-y-4 lg:overflow-y-auto">
        <Card>
          <CardHeader>
            <CardTitle>{t("kiosk.quickPick")}</CardTitle>
            <CardDescription>{t("kiosk.quickPickHint")}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-4 gap-2">
            {QUICK_COUNTS.map((count) => (
              <Button
                key={count}
                variant="outline"
                className="h-12 text-lg font-semibold"
                disabled={busy || mine.length + count > MAX_LOCKS_PER_HOLDER}
                onClick={() => quickPick(count)}
              >
                {count}
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("seats.selected", { count: mine.length })}</CardTitle>
          </CardHeader>
          <CardContent>
            {mine.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("kiosk.emptyBasket")}</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {mine.map((seat) => (
                  <li key={seat.id}>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      aria-label={t("kiosk.releaseSeat", { seat: seatLabel(seat) })}
                      onClick={() => release.mutate(seat)}
                    >
                      {seat.row}
                      {seat.number}
                      <X aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

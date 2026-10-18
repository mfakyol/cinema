"use client";

import { groupBy } from "@sinema/shared";
import { useQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { FormatBadge } from "@/components/format-badge";
import { LoadError } from "@/components/load-error";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, type ScheduledShowtime } from "@/lib/api";
import { usePrice } from "@/lib/format";
import { cn } from "@/lib/utils";

const DAYS = 7;

/** Local midnight `offset` days from today; the box office runs on the cinema's own clock. */
function dayStart(offset: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
}

/** A week of days to sell for, and that day's showtimes by movie. */
export function ShowtimeList({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  const t = useTranslations();
  const format = useFormatter();
  const price = usePrice();
  const [day, setDay] = useState(0);

  const showtimes = useQuery({
    queryKey: ["kiosk-showtimes", day],
    queryFn: () => {
      const query = new URLSearchParams({ from: dayStart(day).toISOString(), to: dayStart(day + 1).toISOString() });
      return apiFetch<{ showtimes: ScheduledShowtime[] }>(`/showtimes?${query}`);
    },
    // Started showtimes drop off the list.
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto pb-1" role="group" aria-label={t("kiosk.title")}>
        {Array.from({ length: DAYS }, (_, offset) => (
          <Button
            key={offset}
            size="sm"
            variant={offset === day ? "default" : "outline"}
            aria-pressed={offset === day}
            className="shrink-0"
            onClick={() => setDay(offset)}
          >
            {offset === 0 ? t("kiosk.today") : format.dateTime(dayStart(offset), { weekday: "short", day: "numeric" })}
          </Button>
        ))}
      </div>

      {showtimes.isError && <LoadError onRetry={() => void showtimes.refetch()} />}
      {showtimes.isPending && <Skeleton className="h-64 w-full" />}
      {showtimes.data?.showtimes.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("kiosk.noShowtimes")}</p>
      )}

      {showtimes.data &&
        [...groupBy(showtimes.data.showtimes, (showtime) => showtime.movie.id).values()].map((list) => (
          <section key={list[0]!.movie.id} className="space-y-2">
            <h2 className="font-semibold">{list[0]!.movie.title}</h2>
            <ul className="space-y-1.5">
              {list.map((showtime) => (
                <li key={showtime.id}>
                  <button
                    type="button"
                    aria-pressed={showtime.id === selectedId}
                    onClick={() => onSelect(showtime.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring",
                      showtime.id === selectedId && "border-primary bg-primary/10",
                    )}
                  >
                    <span className="text-base font-bold text-primary">
                      {format.dateTime(new Date(showtime.startsAt), { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <FormatBadge format={showtime.format} />
                    <span className="mr-auto truncate text-muted-foreground">{showtime.hall.name}</span>
                    <span className={cn("font-medium", showtime.discount && "text-green-600 dark:text-green-400")}>
                      {price(showtime.price)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

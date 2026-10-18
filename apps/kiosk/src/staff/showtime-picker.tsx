import { groupBy, type ScheduledShowtime } from "@sinema/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { FormatBadge } from "@/components/format-badge";
import { MoviePoster } from "@/components/movie-poster";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { usePrice } from "@/lib/format";
import { cn } from "@/lib/utils";

const DAYS = 7;
/** Showings with this few seats left are flagged. */
const FEW_SEATS = 10;

/** Local midnight `offset` days from today; the box office runs on the cinema's own clock. */
function dayStart(offset: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
}

/** Which of the next seven days a time falls on, counting today as 0. */
const dayOffset = (time: string) => Math.floor((new Date(time).getTime() - dayStart(0).getTime()) / 86_400_000);

/** The whole week in one request; days and movies are picked from it without loading again. */
export function ShowtimePicker({ onPick }: { onPick: (showtimeId: string) => void }) {
  const t = useTranslations();
  const format = useFormatter();
  const [chosenDay, setChosenDay] = useState<number | null>(null);

  const week = useQuery({
    queryKey: ["kiosk-week"],
    queryFn: () => {
      const query = new URLSearchParams({ from: dayStart(0).toISOString(), to: dayStart(DAYS).toISOString() });
      return api.fetch<{ showtimes: ScheduledShowtime[] }>(`/showtimes?${query}`);
    },
    // Started showings drop off and seat counts stay fresh.
    refetchInterval: 30_000,
  });

  if (week.isPending) return <Skeleton className="h-full w-full" />;
  if (week.isError) {
    return (
      <div className="grid h-full place-items-center gap-4">
        <p className="text-muted-foreground">{t("common.loadFailed")}</p>
        <Button onClick={() => void week.refetch()}>{t("common.retry")}</Button>
      </div>
    );
  }

  const byDay = groupBy(week.data.showtimes, (showtime) => dayOffset(showtime.startsAt));
  // Late in the evening today may be over; start on the first day with something to sell.
  const day = chosenDay ?? Array.from({ length: DAYS }, (_, i) => i).find((i) => byDay.has(i)) ?? 0;
  const movies = [...groupBy(byDay.get(day) ?? [], (showtime) => showtime.movie.id).values()];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">{t("kiosk.pickShowtime")}</h2>

      <div className="grid grid-cols-7 gap-2" role="group">
        {Array.from({ length: DAYS }, (_, offset) => {
          const count = byDay.get(offset)?.length ?? 0;
          const selected = offset === day;
          return (
            <button
              key={offset}
              type="button"
              disabled={count === 0}
              aria-pressed={selected}
              onClick={() => setChosenDay(offset)}
              className={cn(
                "rounded-xl border bg-card px-2 py-3 text-center transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40",
                selected && "border-primary bg-primary text-primary-foreground hover:bg-primary",
              )}
            >
              <span className="block text-sm font-medium">
                {offset === 0 ? t("kiosk.today") : format.dateTime(dayStart(offset), { weekday: "short" })}
              </span>
              <span className="block text-2xl font-bold">{dayStart(offset).getDate()}</span>
              <span className={cn("block text-xs", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {movies.length === 0 ? (
        <p className="text-muted-foreground">{t("kiosk.noShowtimes")}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {movies.map((showtimes) => (
            <MovieCard key={showtimes[0]!.movie.id} showtimes={showtimes} onPick={onPick} />
          ))}
        </div>
      )}
    </div>
  );
}

function MovieCard({ showtimes, onPick }: { showtimes: ScheduledShowtime[]; onPick: (id: string) => void }) {
  const t = useTranslations();
  const format = useFormatter();
  const price = usePrice();
  const { movie } = showtimes[0]!;

  return (
    <Card className="py-4">
      <CardContent className="flex gap-4 px-4">
        <MoviePoster movie={movie} className="w-20 shrink-0 self-start rounded-md p-2 text-xs" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h3 className="truncate text-lg font-semibold">{movie.title}</h3>
            <p className="text-sm text-muted-foreground">
              {movie.genre} · {t("common.minutes", { count: movie.durationMin })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {showtimes.map((showtime) => {
              const full = showtime.seatsLeft <= 0;
              return (
                <button
                  key={showtime.id}
                  type="button"
                  disabled={full}
                  onClick={() => onPick(showtime.id)}
                  className="min-w-28 rounded-lg border bg-background px-3 py-2 text-left transition-colors hover:border-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-lg font-bold text-primary">
                      {format.dateTime(new Date(showtime.startsAt), { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <FormatBadge format={showtime.format} />
                  </span>
                  <span className="block text-xs text-muted-foreground">{showtime.hall.name}</span>
                  <span className="flex items-center justify-between gap-2 text-xs">
                    <span className={cn("font-medium", showtime.discount && "text-green-600 dark:text-green-400")}>
                      {price(showtime.price)}
                    </span>
                    <span
                      className={cn(
                        "text-muted-foreground",
                        showtime.seatsLeft <= FEW_SEATS && "font-semibold text-destructive",
                      )}
                    >
                      {t("kiosk.seatsLeft", { count: Math.max(showtime.seatsLeft, 0) })}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

import { groupBy, type ScheduledShowtime } from "@sinema/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useFormatter, useNow, useTranslations } from "use-intl";
import { MoviePoster } from "@/components/movie-poster";
import { SegmentedControl } from "@/components/segmented-control";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { usePrice } from "@/lib/format";
import { cn } from "@/lib/utils";

const DAYS = 7;
/** Showings with this few seats left are flagged. */
const FEW_SEATS = 10;
/** Showings starting within this many minutes are flagged, for "what's on next?". */
const SOON_MINUTES = 60;

/** Local midnight `offset` days from today; the box office runs on the cinema's own clock. */
function dayStart(offset: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
}

type View = "movie" | "time";
/** Which of the next seven days a time falls on, counting today as 0. */
const dayOffset = (time: string) => Math.floor((new Date(time).getTime() - dayStart(0).getTime()) / 86_400_000);

/**
 * The whole week in one request; days, and either movies or start times, are picked from it
 * without loading again.
 */
export function ShowtimePicker({ onPick }: { onPick: (showtimeId: string) => void }) {
  const t = useTranslations();
  const format = useFormatter();
  const [chosenDay, setChosenDay] = useState<number | null>(null);
  const [view, setView] = useState<View>("movie");

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
  const dayShowtimes = byDay.get(day) ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold tracking-tight">{t("kiosk.pickShowtime")}</h2>
        <SegmentedControl
          label={t("kiosk.pickShowtime")}
          value={view}
          onChange={setView}
          options={[
            { value: "movie", label: t("kiosk.byMovie") },
            { value: "time", label: t("kiosk.byTime") },
          ]}
        />
      </div>

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
                {t("kiosk.showings", { count })}
              </span>
            </button>
          );
        })}
      </div>

      {dayShowtimes.length === 0 ? (
        <p className="text-muted-foreground">{t("kiosk.noShowtimes")}</p>
      ) : view === "movie" ? (
        <ul className="grid items-start gap-3 xl:grid-cols-2">
          {[...groupBy(dayShowtimes, (showtime) => showtime.movie.id).values()].map((showtimes) => (
            <MovieRow key={showtimes[0]!.movie.id} showtimes={showtimes} onPick={onPick} />
          ))}
        </ul>
      ) : (
        <ByTime showtimes={dayShowtimes} onPick={onPick} />
      )}
    </div>
  );
}

/**
 * One showing as a compact chip, the same in both views: time and format, the movie in the
 * by-time view, then seats left (red when few) and price (green when discounted). Showings
 * starting within the hour say how soon, in amber.
 */
function ShowtimeChip({
  showtime,
  now,
  withTitle = false,
  onPick,
}: {
  showtime: ScheduledShowtime;
  now: Date;
  withTitle?: boolean;
  onPick: (id: string) => void;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const price = usePrice();
  const minutes = Math.ceil((new Date(showtime.startsAt).getTime() - now.getTime()) / 60_000);
  const soon = minutes >= 0 && minutes <= SOON_MINUTES;

  return (
    <button
      type="button"
      disabled={showtime.seatsLeft <= 0}
      onClick={() => onPick(showtime.id)}
      className={cn(
        "rounded-lg border bg-background px-2.5 py-1.5 text-left transition-colors hover:border-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40",
        withTitle ? "w-48" : "w-32",
      )}
    >
      <span className="flex items-center justify-between gap-1">
        <span className="text-lg font-bold tabular-nums">
          {format.dateTime(new Date(showtime.startsAt), { hour: "2-digit", minute: "2-digit" })}
        </span>
        <span className="text-xs font-semibold text-muted-foreground">{t(`format.${showtime.format}`)}</span>
      </span>
      {withTitle && <span className="block truncate text-sm font-medium">{showtime.movie.title}</span>}
      {soon && (
        <span className="block text-xs font-semibold text-amber-600 dark:text-amber-400">
          {t("kiosk.startsIn", { count: minutes })}
        </span>
      )}
      <span className="flex items-center justify-between gap-1 text-xs">
        <span
          className={cn(
            "whitespace-nowrap text-muted-foreground",
            showtime.seatsLeft <= FEW_SEATS && "font-semibold text-destructive",
          )}
        >
          {t("kiosk.seatsFree", { count: Math.max(showtime.seatsLeft, 0) })}
        </span>
        <span className={cn("whitespace-nowrap tabular-nums", showtime.discount && "text-green-600 dark:text-green-400")}>
          {price(showtime.price)}
        </span>
      </span>
    </button>
  );
}

/**
 * Every showing of the day in start order, a row of chips per hour, for customers who ask what
 * is on next. Today it starts from now.
 */
function ByTime({ showtimes, onPick }: { showtimes: ScheduledShowtime[]; onPick: (id: string) => void }) {
  const now = useNow({ updateInterval: 30_000 });
  const hours = groupBy(showtimes, (showtime) => new Date(showtime.startsAt).getHours());

  return (
    <ul className="space-y-3">
      {[...hours].map(([hour, list]) => (
        <li key={hour} className="flex gap-4 rounded-xl border bg-card p-3">
          <h3 className="w-16 shrink-0 pt-1.5 text-lg font-semibold tabular-nums text-muted-foreground">
            {`${String(hour).padStart(2, "0")}:00`}
          </h3>
          <div className="flex flex-wrap gap-2">
            {list.map((showtime) => (
              <ShowtimeChip key={showtime.id} showtime={showtime} now={now} withTitle onPick={onPick} />
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * One movie: the poster and details on one line, its showings below as compact chips that wrap
 * onto as many lines as they need.
 */
function MovieRow({ showtimes, onPick }: { showtimes: ScheduledShowtime[]; onPick: (id: string) => void }) {
  const t = useTranslations();
  const now = useNow({ updateInterval: 30_000 });
  const { movie } = showtimes[0]!;

  return (
    <li className="space-y-3 rounded-xl border bg-card p-3">
      <div className="flex gap-3">
        <MoviePoster movie={movie} className="w-12 shrink-0 rounded-md text-[8px]" />
        <div className="min-w-0 py-1">
          <h3 className="line-clamp-2 font-semibold leading-snug">{movie.title}</h3>
          <p className="text-xs text-muted-foreground">
            {movie.genre} · {t("common.minutes", { count: movie.durationMin })}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {showtimes.map((showtime) => (
          <ShowtimeChip key={showtime.id} showtime={showtime} now={now} onPick={onPick} />
        ))}
      </div>
    </li>
  );
}

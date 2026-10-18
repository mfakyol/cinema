"use client";

import { CINEMA_TIME_ZONE, groupBy, SHOW_FORMATS } from "@sinema/shared";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { FormatBadge } from "@/components/format-badge";
import { LoadError } from "@/components/load-error";
import { MoviePoster } from "@/components/movie-poster";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, type Movie, type Showtime } from "@/lib/api";
import { usePrice } from "@/lib/format";

/** A calendar day in the cinema's time zone, as YYYY-MM-DD. */
const dayKey = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: CINEMA_TIME_ZONE }).format(date);

export function MovieDetail({ id }: { id: string }) {
  const t = useTranslations();
  const format = useFormatter();
  const now = useNow();

  const movie = useQuery({
    queryKey: ["movie", id],
    queryFn: () => apiFetch<{ movie: Movie }>(`/movies/${id}`),
  });
  const showtimes = useQuery({
    queryKey: ["showtimes", id],
    queryFn: () => apiFetch<{ showtimes: Showtime[] }>(`/movies/${id}/showtimes`),
  });

  if (movie.isError || showtimes.isError) {
    return (
      <LoadError
        onRetry={() => {
          void movie.refetch();
          void showtimes.refetch();
        }}
      />
    );
  }

  const days = groupBy(showtimes.data?.showtimes ?? [], (s) => dayKey(new Date(s.startsAt)));
  const today = dayKey(now);
  const tomorrow = dayKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const dayLabel = (key: string, first: Showtime) =>
    key === today
      ? t("movie.today")
      : key === tomorrow
        ? t("movie.tomorrow")
        : format.dateTime(new Date(first.startsAt), { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-8">
      <Button variant="ghost" size="sm" asChild className="-ml-3">
        <Link href="/">
          <ArrowLeft aria-hidden />
          {t("common.back")}
        </Link>
      </Button>

      <div className="grid gap-8 sm:grid-cols-[220px_1fr]">
        {movie.data ? (
          <MoviePoster movie={movie.data.movie} />
        ) : (
          <Skeleton className="aspect-[2/3] w-full rounded-lg" />
        )}
        <div className="space-y-4">
          {movie.data ? (
            <>
              <h1 className="text-3xl font-bold tracking-tight">{movie.data.movie.title}</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary">{movie.data.movie.genre}</Badge>
                {t("common.minutes", { count: movie.data.movie.durationMin })}
              </div>
              <p className="max-w-prose leading-relaxed">{movie.data.movie.description}</p>
            </>
          ) : (
            <>
              <Skeleton className="h-9 w-2/3" />
              <Skeleton className="h-16 w-full" />
            </>
          )}
        </div>
      </div>

      <section className="space-y-6">
        <h2 className="text-xl font-semibold">{t("movie.showtimes")}</h2>
        {showtimes.isPending && <Skeleton className="h-24 w-full" />}
        {showtimes.data?.showtimes.length === 0 && (
          <p className="text-muted-foreground">{t("movie.noShowtimes")}</p>
        )}
        {[...days].map(([key, list]) => {
          // Within a day, one row per format (2D, 3D, IMAX, IMAX 3D), each with its own halls.
          const byFormat = groupBy(list, (showtime) => showtime.format);
          return (
            <div key={key} className="space-y-4">
              <h3 className="font-semibold">{dayLabel(key, list[0]!)}</h3>
              {SHOW_FORMATS.filter((showFormat) => byFormat.has(showFormat)).map((showFormat) => (
                <div key={showFormat} className="space-y-2">
                  <FormatBadge format={showFormat} />
                  <ul className="flex flex-wrap gap-3">
                    {byFormat.get(showFormat)!.map((showtime) => (
                      <li key={showtime.id}>
                        <ShowtimeButton showtime={showtime} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          );
        })}
      </section>
    </div>
  );
}

/** "2D" quiet, premium formats (3D, IMAX) in the brand colour. */
function ShowtimeButton({ showtime }: { showtime: Showtime }) {
  const t = useTranslations("discounts");
  const format = useFormatter();
  const price = usePrice();
  return (
    <Button variant="outline" className="h-auto min-w-28 flex-col items-start gap-0.5 bg-card px-4 py-2" asChild>
      <Link href={`/showtimes/${showtime.id}`}>
        <span className="text-lg font-bold text-primary">
          {format.dateTime(new Date(showtime.startsAt), { hour: "2-digit", minute: "2-digit" })}
        </span>
        <span className="text-xs text-muted-foreground">
          {showtime.hall.name} · {price(showtime.price)}
          {showtime.discount && <s className="ml-1">{price(showtime.basePrice)}</s>}
        </span>
        {showtime.discount && (
          <span className="text-xs font-semibold text-green-600 dark:text-green-400">
            {t(showtime.discount.kind, { percent: showtime.discount.percent })}
          </span>
        )}
      </Link>
    </Button>
  );
}

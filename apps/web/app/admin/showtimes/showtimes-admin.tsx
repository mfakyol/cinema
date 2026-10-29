"use client";

import {
  type AdminHall,
  type AdminMovie,
  type AdminShowtime,
  cinemaTime,
  DEFAULT_PRICES,
  groupBy,
  type ShowFormat,
} from "@sinema/shared";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { FormatBadge } from "@/components/format-badge";
import { LoadError } from "@/components/load-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { usePrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isoDay, selectClass, useAdminMutation } from "../admin-ui";
import { hallsQuery } from "../halls/halls-admin";
import { moviesQuery } from "../movies/movies-admin";

const shiftDay = (day: string, by: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + by);
  return date.toISOString().slice(0, 10);
};

/** Movie, hall and format, with the format limited to what the hall can show. */
function ShowtimeBasics({
  movies,
  halls,
  value,
  onChange,
}: {
  movies: AdminMovie[];
  halls: AdminHall[];
  value: { movieId: string; hallId: string; format: ShowFormat; price: string };
  onChange: (value: { movieId: string; hallId: string; format: ShowFormat; price: string }) => void;
}) {
  const t = useTranslations();
  const hall = halls.find((candidate) => candidate.id === value.hallId);
  const pickFormat = (format: ShowFormat) => onChange({ ...value, format, price: String(DEFAULT_PRICES[format] / 100) });
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="st-movie">{t("admin.movie")}</Label>
        <select id="st-movie" className={cn(selectClass, "w-full")} value={value.movieId} onChange={(e) => onChange({ ...value, movieId: e.target.value })}>
          {movies.map((movie) => (
            <option key={movie.id} value={movie.id}>
              {movie.title} ({t("admin.minutes", { count: movie.durationMin })})
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="st-hall">{t("admin.hall")}</Label>
        <select
          id="st-hall"
          className={cn(selectClass, "w-full")}
          value={value.hallId}
          onChange={(e) => {
            const next = halls.find((candidate) => candidate.id === e.target.value);
            const format = next?.formats.includes(value.format) ? value.format : (next?.formats[0] ?? "TWO_D");
            onChange({ ...value, hallId: e.target.value, format, price: String(DEFAULT_PRICES[format] / 100) });
          }}
        >
          {halls.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="st-format">{t("admin.format")}</Label>
        <select id="st-format" className={cn(selectClass, "w-full")} value={value.format} onChange={(e) => pickFormat(e.target.value as ShowFormat)}>
          {(hall?.formats ?? []).map((format) => (
            <option key={format} value={format}>
              {t(`format.${format}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="st-price">{t("admin.price")}</Label>
        <Input id="st-price" inputMode="decimal" value={value.price} onChange={(e) => onChange({ ...value, price: e.target.value })} />
      </div>
    </>
  );
}

function AddShowtimes({ movies, halls, day, onDone }: { movies: AdminMovie[]; halls: AdminHall[]; day: string; onDone: () => void }) {
  const t = useTranslations("admin");
  const format = useFormatter();
  const [mode, setMode] = useState<"one" | "bulk">("one");
  const firstHall = halls[0];
  const [basics, setBasics] = useState({
    movieId: movies[0]?.id ?? "",
    hallId: firstHall?.id ?? "",
    format: (firstHall?.formats[0] ?? "TWO_D") as ShowFormat,
    price: String(DEFAULT_PRICES[firstHall?.formats[0] ?? "TWO_D"] / 100),
  });
  const [date, setDate] = useState(day);
  const [time, setTime] = useState("20:00");
  const [from, setFrom] = useState(day);
  const [to, setTo] = useState(shiftDay(day, 6));
  const [times, setTimes] = useState("14:00, 20:00");
  const [skipped, setSkipped] = useState<{ startsAt: string; reason: "PAST" | "HALL_BUSY" | "FORMAT_NOT_IN_HALL" }[]>([]);
  const price = Math.round(Number(basics.price.replace(",", ".")) * 100);
  const common = { movieId: basics.movieId, hallId: basics.hallId, format: basics.format, price };

  const addOne = useAdminMutation(
    () => apiFetch("/admin/showtimes", { method: "POST", body: JSON.stringify({ ...common, startsAt: cinemaTime(date, time) }) }),
    t("added"),
  );
  const addMany = useAdminMutation(
    () =>
      apiFetch<{ created: number; skipped: typeof skipped }>("/admin/showtimes/bulk", {
        method: "POST",
        body: JSON.stringify({ ...common, from, to, times: times.split(/[\s,]+/).filter(Boolean) }),
      }),
    (result) => {
      setSkipped(result.skipped);
      return t("bulkResult", { created: result.created, skipped: result.skipped.length });
    },
  );
  const valid = basics.movieId && basics.hallId && Number.isFinite(price) && price >= 0;

  return (
    <Card className="border-primary">
      <CardHeader>
        <div className="flex w-fit gap-1 rounded-lg bg-muted p-1" role="group">
          <Button size="sm" variant={mode === "one" ? "default" : "ghost"} aria-pressed={mode === "one"} onClick={() => setMode("one")}>
            {t("newShowtime")}
          </Button>
          <Button size="sm" variant={mode === "bulk" ? "default" : "ghost"} aria-pressed={mode === "bulk"} onClick={() => setMode("bulk")}>
            {t("bulkAdd")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ShowtimeBasics movies={movies} halls={halls} value={basics} onChange={setBasics} />
          {mode === "one" ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="st-date">{t("date")}</Label>
                <Input id="st-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="st-time">{t("time")}</Label>
                <Input id="st-time" type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="st-from">{t("from")}</Label>
                <Input id="st-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="st-to">{t("to")}</Label>
                <Input id="st-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="st-times">{t("times")}</Label>
                <Input id="st-times" value={times} onChange={(e) => setTimes(e.target.value)} />
              </div>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            disabled={!valid || addOne.isPending || addMany.isPending}
            onClick={() => (mode === "one" ? addOne.mutate(undefined) : addMany.mutate(undefined))}
          >
            {t("add")}
          </Button>
          <Button variant="ghost" onClick={onDone}>
            {t("cancel")}
          </Button>
        </div>
        {skipped.length > 0 && (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {skipped.map((row) => (
              <li key={row.startsAt}>
                {t("skipped", {
                  time: format.dateTime(new Date(row.startsAt), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
                  reason: t(`reasons.${row.reason}`),
                })}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** One showtime row, with an inline confirmation to cancel it. */
function ShowtimeRow({ showtime }: { showtime: AdminShowtime }) {
  const t = useTranslations();
  const format = useFormatter();
  const price = usePrice();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const cancel = useAdminMutation(
    () =>
      apiFetch<{ refunded: number }>(`/admin/showtimes/${showtime.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() }),
      }),
    (result) => t("admin.cancelledResult", { refunded: result.refunded }),
  );
  const at = (iso: string) => format.dateTime(new Date(iso), { hour: "2-digit", minute: "2-digit" });
  const cancelled = showtime.cancelledAt !== null;
  const started = new Date(showtime.startsAt) <= new Date();

  return (
    <li className={cn("space-y-3 rounded-lg border bg-card p-3", cancelled && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="w-28 font-semibold tabular-nums">
          {at(showtime.startsAt)} <span className="text-xs font-normal text-muted-foreground">– {at(showtime.endsAt)}</span>
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{showtime.movie.title}</span>
        <FormatBadge format={showtime.format} />
        <span className="text-sm tabular-nums">{price(showtime.price)}</span>
        <span className="text-sm text-muted-foreground">{t("admin.soldOf", { sold: showtime.sold, seats: showtime.seatCount })}</span>
        {cancelled ? (
          <Badge variant="destructive" title={showtime.cancelReason ?? undefined}>
            {t("admin.cancelled")}
          </Badge>
        ) : (
          <Button variant="outline" size="sm" disabled={started || confirming} onClick={() => setConfirming(true)}>
            {t("admin.cancelShowtime")}
          </Button>
        )}
      </div>
      {cancelled && showtime.cancelReason && <p className="text-xs text-muted-foreground">{showtime.cancelReason}</p>}
      {confirming && !cancelled && (
        <div className="space-y-3 rounded-md border border-destructive/50 bg-destructive/5 p-3">
          <p className="text-sm font-medium">{t("admin.cancelTitle", { movie: showtime.movie.title, time: at(showtime.startsAt) })}</p>
          <p className="text-sm text-muted-foreground">{t("admin.cancelWarning", { count: showtime.sold })}</p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-56 flex-1 space-y-1.5">
              <Label htmlFor={`reason-${showtime.id}`}>{t("admin.reason")}</Label>
              <Input id={`reason-${showtime.id}`} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
            </div>
            <Button variant="destructive" disabled={reason.trim().length < 3 || cancel.isPending} onClick={() => cancel.mutate(undefined)}>
              {t("admin.confirmCancel")}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {t("admin.keep")}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export function ShowtimesAdmin() {
  const t = useTranslations("admin");
  const format = useFormatter();
  const [day, setDay] = useState(() => isoDay());
  const [adding, setAdding] = useState(false);
  const movies = useQuery(moviesQuery);
  const halls = useQuery(hallsQuery);
  const showtimes = useQuery({
    queryKey: ["admin", "showtimes", day],
    queryFn: () => {
      const from = cinemaTime(day, "00:00").toISOString();
      const to = cinemaTime(shiftDay(day, 1), "00:00").toISOString();
      return apiFetch<{ showtimes: AdminShowtime[] }>(`/admin/showtimes?${new URLSearchParams({ from, to })}`);
    },
  });

  if (movies.isError || halls.isError) return <LoadError onRetry={() => void Promise.all([movies.refetch(), halls.refetch()])} />;
  if (!movies.data || !halls.data) return <Skeleton className="h-96 w-full" />;
  const byHall = groupBy(showtimes.data?.showtimes ?? [], (showtime) => showtime.hall.name);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{t("showtimes")}</h1>
        {!adding && (
          <Button onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            {t("newShowtime")}
          </Button>
        )}
      </div>
      {adding && <AddShowtimes movies={movies.data.movies} halls={halls.data.halls} day={day} onDone={() => setAdding(false)} />}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" aria-label="−1" onClick={() => setDay(shiftDay(day, -1))}>
          <ChevronLeft aria-hidden />
        </Button>
        <Input type="date" className="w-44" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label={t("date")} />
        <Button variant="outline" size="icon" aria-label="+1" onClick={() => setDay(shiftDay(day, 1))}>
          <ChevronRight aria-hidden />
        </Button>
        <span className="text-sm text-muted-foreground">
          {format.dateTime(new Date(`${day}T12:00:00Z`), { weekday: "long", day: "numeric", month: "long" })}
        </span>
      </div>

      {showtimes.isError && <LoadError onRetry={() => void showtimes.refetch()} />}
      {showtimes.isPending && <Skeleton className="h-64 w-full" />}
      {showtimes.data?.showtimes.length === 0 && <p className="text-muted-foreground">{t("noShowtimes")}</p>}
      {[...byHall].map(([hall, list]) => (
        <section key={hall} className="space-y-2">
          <h2 className="font-semibold">{hall}</h2>
          <ul className="space-y-2">
            {list.map((showtime) => (
              <ShowtimeRow key={`${showtime.id}:${showtime.cancelledAt}`} showtime={showtime} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

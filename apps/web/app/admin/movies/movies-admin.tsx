"use client";

import { type AdminMovie, type MovieInput, movieSchema } from "@sinema/shared";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { LoadError } from "@/components/load-error";
import { MoviePoster } from "@/components/movie-poster";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { useAdminMutation } from "../admin-ui";

export const moviesQuery = {
  queryKey: ["admin", "movies"],
  queryFn: () => apiFetch<{ movies: AdminMovie[] }>("/admin/movies"),
};

type Draft = { title: string; genre: string; durationMin: string; description: string; posterUrl: string };

const toDraft = (movie?: AdminMovie): Draft => ({
  title: movie?.title ?? "",
  genre: movie?.genre ?? "",
  durationMin: movie ? String(movie.durationMin) : "",
  description: movie?.description ?? "",
  posterUrl: movie?.posterUrl ?? "",
});

const fromDraft = (draft: Draft) =>
  movieSchema.safeParse({
    title: draft.title,
    genre: draft.genre,
    durationMin: Number(draft.durationMin),
    description: draft.description,
    posterUrl: draft.posterUrl.trim() || null,
  });

/** Add or edit a movie; the same form for both. */
function MovieForm({ movie, onDone }: { movie?: AdminMovie; onDone: () => void }) {
  const t = useTranslations("admin");
  const [draft, setDraft] = useState(() => toDraft(movie));
  const parsed = fromDraft(draft);
  const save = useAdminMutation(
    (input: MovieInput) =>
      apiFetch(movie ? `/admin/movies/${movie.id}` : "/admin/movies", {
        method: movie ? "PUT" : "POST",
        body: JSON.stringify(input),
      }),
    t("saved"),
  );
  const field = (key: keyof Draft, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${movie?.id ?? "new"}-${key}`}>{label}</Label>
      <Input
        id={`${movie?.id ?? "new"}-${key}`}
        value={draft[key]}
        onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
        {...props}
      />
    </div>
  );

  return (
    <Card className="border-primary">
      <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
        {field("title", t("movieTitle"))}
        {field("genre", t("genre"))}
        {field("durationMin", t("duration"), { inputMode: "numeric" })}
        {field("posterUrl", t("posterUrl"), { type: "url" })}
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${movie?.id ?? "new"}-description`}>{t("description")}</Label>
          <textarea
            id={`${movie?.id ?? "new"}-description`}
            rows={3}
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-ring"
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <Button
            disabled={!parsed.success || save.isPending}
            onClick={() => parsed.success && save.mutate(parsed.data, { onSuccess: onDone })}
          >
            {movie ? t("save") : t("create")}
          </Button>
          <Button variant="ghost" onClick={onDone}>
            {t("cancel")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function MoviesAdmin() {
  const t = useTranslations("admin");
  const movies = useQuery(moviesQuery);
  const [editing, setEditing] = useState<string | "new" | null>(null);

  if (movies.isError) return <LoadError onRetry={() => void movies.refetch()} />;
  if (!movies.data) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{t("movies")}</h1>
        {editing !== "new" && (
          <Button onClick={() => setEditing("new")}>
            <Plus aria-hidden />
            {t("newMovie")}
          </Button>
        )}
      </div>
      {editing === "new" && <MovieForm onDone={() => setEditing(null)} />}
      <ul className="space-y-3">
        {movies.data.movies.map((movie) =>
          editing === movie.id ? (
            <li key={movie.id}>
              <MovieForm movie={movie} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={movie.id}>
              <Card className="py-3">
                <CardContent className="flex items-center gap-4 px-4">
                  <MoviePoster movie={movie} className="w-10 shrink-0 rounded-md p-0 text-[6px]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{movie.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {movie.genre} · {t("minutes", { count: movie.durationMin })} ·{" "}
                      {t("upcoming", { count: movie.upcomingShowtimes })}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setEditing(movie.id)}>
                    <Pencil aria-hidden />
                    {t("editMovie")}
                  </Button>
                </CardContent>
              </Card>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

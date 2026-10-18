"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LoadError } from "@/components/load-error";
import { MoviePoster } from "@/components/movie-poster";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, type Movie } from "@/lib/api";

export function MovieGrid() {
  const t = useTranslations();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["movies"],
    queryFn: () => apiFetch<{ movies: Movie[] }>("/movies"),
  });

  if (isError) return <LoadError onRetry={() => void refetch()} />;

  return (
    <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3">
      {isPending
        ? Array.from({ length: 3 }, (_, i) => (
            <li key={i} className="space-y-3">
              <Skeleton className="aspect-[2/3] w-full rounded-lg" />
              <Skeleton className="h-4 w-2/3" />
            </li>
          ))
        : data.movies.map((movie) => (
            <li key={movie.id}>
              <Link
                href={`/movies/${movie.id}`}
                className="group block space-y-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4"
              >
                <MoviePoster
                  movie={movie}
                  className="transition group-hover:scale-[1.02] group-hover:shadow-lg"
                />
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="secondary">{movie.genre}</Badge>
                  {t("common.minutes", { count: movie.durationMin })}
                </div>
              </Link>
            </li>
          ))}
      {data?.movies.length === 0 && (
        <li className="col-span-full text-muted-foreground">{t("home.empty")}</li>
      )}
    </ul>
  );
}

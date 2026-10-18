import type { Movie } from "@sinema/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { Pressable, useWindowDimensions, View } from "react-native";
import { useTranslations } from "use-intl";
import { LoadError } from "@/components/load-error";
import { MoviePoster } from "@/components/movie-poster";
import { Loading, Screen, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { spacing } from "@/lib/theme";

export default function MoviesScreen() {
  const t = useTranslations();
  const { width } = useWindowDimensions();
  const movies = useQuery({ queryKey: ["movies"], queryFn: () => api.fetch<{ movies: Movie[] }>("/movies") });
  const columnWidth = (Math.min(width, 600) - spacing.lg * 3) / 2;

  return (
    <Screen>
      <View style={{ gap: spacing.xs }}>
        <Text variant="title">{t("home.title")}</Text>
        <Text variant="muted">{t("home.subtitle")}</Text>
      </View>
      {movies.isError && <LoadError onRetry={() => void movies.refetch()} />}
      {movies.isPending && <Loading />}
      {movies.data?.movies.length === 0 && <Text variant="muted">{t("home.empty")}</Text>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.lg }}>
        {movies.data?.movies.map((movie) => (
          <Link key={movie.id} href={`/movies/${movie.id}`} asChild>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`${movie.title}, ${movie.genre}, ${t("common.minutes", { count: movie.durationMin })}`}
              style={({ pressed }) => ({ width: columnWidth, gap: spacing.sm, opacity: pressed ? 0.8 : 1 })}
            >
              <MoviePoster movie={movie} width={columnWidth} />
              <Text variant="small">
                {movie.genre} · {t("common.minutes", { count: movie.durationMin })}
              </Text>
            </Pressable>
          </Link>
        ))}
      </View>
    </Screen>
  );
}

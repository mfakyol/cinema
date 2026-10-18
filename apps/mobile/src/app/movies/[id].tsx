import { CINEMA_TIME_ZONE, type Movie, type Showtime } from "@sinema/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, Stack, useLocalSearchParams } from "expo-router";
import { Pressable, View } from "react-native";
import { useFormatter, useNow, useTranslations } from "use-intl";
import { LoadError } from "@/components/load-error";
import { MoviePoster } from "@/components/movie-poster";
import { Loading, Screen, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { usePrice } from "@/lib/format";
import { radius, spacing, useColors } from "@/lib/theme";

/** A calendar day in the cinema's time zone, as YYYY-MM-DD. */
const dayKey = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: CINEMA_TIME_ZONE }).format(date);

export default function MovieScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const format = useFormatter();
  const now = useNow();
  const price = usePrice();
  const colors = useColors();

  const movie = useQuery({ queryKey: ["movie", id], queryFn: () => api.fetch<{ movie: Movie }>(`/movies/${id}`) });
  const showtimes = useQuery({
    queryKey: ["showtimes", id],
    queryFn: () => api.fetch<{ showtimes: Showtime[] }>(`/movies/${id}/showtimes`),
  });

  if (movie.isError || showtimes.isError) {
    return (
      <Screen>
        <LoadError onRetry={() => void Promise.all([movie.refetch(), showtimes.refetch()])} />
      </Screen>
    );
  }
  if (!movie.data) return <Loading />;

  const days = Map.groupBy(showtimes.data?.showtimes ?? [], (s) => dayKey(new Date(s.startsAt)));
  const today = dayKey(now);
  const tomorrow = dayKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const dayLabel = (key: string, first: Showtime) =>
    key === today
      ? t("movie.today")
      : key === tomorrow
        ? t("movie.tomorrow")
        : format.dateTime(new Date(first.startsAt), { weekday: "long", day: "numeric", month: "long" });

  const { movie: m } = movie.data;
  return (
    <Screen>
      <Stack.Screen options={{ title: m.title }} />
      <View style={{ flexDirection: "row", gap: spacing.lg }}>
        <MoviePoster movie={m} width={120} />
        <View style={{ flex: 1, gap: spacing.sm }}>
          <Text variant="heading">{m.title}</Text>
          <Text variant="small">
            {m.genre} · {t("common.minutes", { count: m.durationMin })}
          </Text>
          <Text variant="muted">{m.description}</Text>
        </View>
      </View>

      <Text variant="heading">{t("movie.showtimes")}</Text>
      {showtimes.isPending && <Loading />}
      {showtimes.data?.showtimes.length === 0 && <Text variant="muted">{t("movie.noShowtimes")}</Text>}
      {[...days].map(([key, list]) => (
        <View key={key} style={{ gap: spacing.sm }}>
          <Text variant="small">{dayLabel(key, list[0]!)}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {list.map((showtime) => (
              <Link key={showtime.id} href={`/showtimes/${showtime.id}`} asChild>
                <Pressable
                  accessibilityRole="link"
                  style={({ pressed }) => ({
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: radius.md,
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.md,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ fontWeight: "600" }}>
                    {format.dateTime(new Date(showtime.startsAt), { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                  <Text variant="small">
                    {showtime.hall.name} · {price(showtime.price)}
                  </Text>
                </Pressable>
              </Link>
            ))}
          </View>
        </View>
      ))}
    </Screen>
  );
}

import { CINEMA_TIME_ZONE, groupBy, type Movie, SHOW_FORMATS, type ShowFormat, type Showtime } from "@sinema/shared";
import { useQuery } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
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

  const days = groupBy(showtimes.data?.showtimes ?? [], (s) => dayKey(new Date(s.startsAt)));
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
      {[...days].map(([key, list]) => {
        // Within a day, one row per format (2D, 3D, IMAX, IMAX 3D), each with its own halls.
        const byFormat = groupBy(list, (showtime) => showtime.format);
        return (
          <View key={key} style={{ gap: spacing.md }}>
            <Text variant="heading">{dayLabel(key, list[0]!)}</Text>
            {SHOW_FORMATS.filter((showFormat) => byFormat.has(showFormat)).map((showFormat) => (
              <View key={showFormat} style={{ gap: spacing.sm }}>
                <FormatBadge format={showFormat} />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                  {byFormat.get(showFormat)!.map((showtime) => (
                    <ShowtimeButton key={showtime.id} showtime={showtime} />
                  ))}
                </View>
              </View>
            ))}
          </View>
        );
      })}
    </Screen>
  );
}

/** "2D" in grey, premium formats (3D, IMAX) in the brand colour. */
function FormatBadge({ format }: { format: ShowFormat }) {
  const t = useTranslations("format");
  const colors = useColors();
  const premium = format !== "TWO_D";
  return (
    <View
      style={{
        alignSelf: "flex-start",
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderRadius: radius.sm,
        backgroundColor: premium ? colors.primary : colors.muted,
      }}
    >
      <Text variant="small" style={{ fontWeight: "700", color: premium ? colors.primaryForeground : colors.foreground }}>
        {t(format)}
      </Text>
    </View>
  );
}

function ShowtimeButton({ showtime }: { showtime: Showtime }) {
  const t = useTranslations("discounts");
  const format = useFormatter();
  const price = usePrice();
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/showtimes/${showtime.id}`)}
      style={({ pressed }) => ({
        minWidth: 96,
        borderWidth: 1,
        borderColor: pressed ? colors.primary : colors.border,
        backgroundColor: colors.card,
        borderRadius: radius.md,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        alignItems: "center",
        gap: 2,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text style={{ fontWeight: "700", fontSize: 18, color: colors.primary }}>
        {format.dateTime(new Date(showtime.startsAt), { hour: "2-digit", minute: "2-digit" })}
      </Text>
      <Text variant="small">
        {showtime.hall.name} · {price(showtime.price)}
      </Text>
      {showtime.discount && (
        <>
          <Text variant="small" style={{ textDecorationLine: "line-through" }}>
            {price(showtime.basePrice)}
          </Text>
          <Text variant="small" style={{ color: colors.success, fontWeight: "700" }}>
            {t(showtime.discount.kind, { percent: showtime.discount.percent })}
          </Text>
        </>
      )}
    </Pressable>
  );
}

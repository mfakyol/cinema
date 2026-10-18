import type { Movie } from "@sinema/shared";
import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import { radius, spacing } from "@/lib/theme";
import { Text } from "./ui";

/** A stable hue per movie, so placeholder posters differ but never change between visits. */
function hueFor(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}

/** The movie's poster, or a coloured placeholder with its title while there is none. */
export function MoviePoster({ movie, width }: { movie: Pick<Movie, "id" | "title" | "posterUrl">; width: number }) {
  const size = { width, height: width * 1.5, borderRadius: radius.lg };
  if (movie.posterUrl) {
    return <Image source={movie.posterUrl} style={size} contentFit="cover" accessibilityIgnoresInvertColors />;
  }
  return (
    <View
      accessible={false}
      style={[size, styles.placeholder, { backgroundColor: `hsl(${hueFor(movie.id)}, 45%, 32%)` }]}
    >
      <Text style={styles.title} numberOfLines={3}>
        {movie.title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { justifyContent: "flex-end", padding: spacing.md },
  title: { color: "#ffffff", fontSize: 18, fontWeight: "700" },
});

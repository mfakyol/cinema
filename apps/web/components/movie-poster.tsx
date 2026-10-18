import { cn } from "@/lib/utils";

/** A stable hue per movie, so placeholder posters differ but never change between visits. */
function hueFor(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}

/** The movie's poster, or a coloured placeholder with its title while there is none. */
export function MoviePoster({
  movie,
  className,
}: {
  movie: { id: string; title: string; posterUrl?: string | null };
  className?: string;
}) {
  if (movie.posterUrl) {
    return (
      // Posters come from arbitrary hosts, so next/image's domain allowlist does not fit here.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={movie.posterUrl}
        alt=""
        className={cn("aspect-[2/3] w-full rounded-lg object-cover", className)}
      />
    );
  }
  const hue = hueFor(movie.id);
  return (
    <div
      aria-hidden
      className={cn(
        "flex aspect-[2/3] w-full items-end rounded-lg p-4 text-xl font-semibold leading-tight text-white",
        className,
      )}
      style={{
        backgroundImage: `linear-gradient(160deg, oklch(0.55 0.15 ${hue}), oklch(0.25 0.08 ${(hue + 40) % 360}))`,
      }}
    >
      {movie.title}
    </div>
  );
}

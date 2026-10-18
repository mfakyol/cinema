export const LOCALES = ["en", "tr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Prices are stored in minor units of this currency. */
export const CURRENCY = "TRY";

/** Showtimes are shown in the cinema's local time, wherever the viewer is. */
export const CINEMA_TIME_ZONE = "Europe/Istanbul";

function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * Picks the first supported locale from the user's preferred languages, in order,
 * matching on the language part ("tr-TR" matches "tr").
 */
export function matchLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const language = tag.trim().toLowerCase().split("-")[0] ?? "";
    if (isLocale(language)) return language;
  }
  return DEFAULT_LOCALE;
}

/** Parses an Accept-Language header into language tags, highest quality first. */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.find((param) => param.trim().startsWith("q="));
      return { tag: tag.trim(), quality: q ? Number(q.trim().slice(2)) : 1 };
    })
    .filter(({ tag, quality }) => tag && tag !== "*" && quality > 0)
    .sort((a, b) => b.quality - a.quality)
    .map(({ tag }) => tag);
}

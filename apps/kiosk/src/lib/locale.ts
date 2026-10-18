import { type Locale, matchLocale } from "@sinema/shared";

/** English or Turkish from the browser's language list, as on the website. */
export const locale: Locale = matchLocale(navigator.languages);

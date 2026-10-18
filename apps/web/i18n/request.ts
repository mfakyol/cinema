import { CINEMA_TIME_ZONE, matchLocale, parseAcceptLanguage } from "@sinema/shared";
import { headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

// There is no language switcher: the browser's language list decides, falling back to English.
export default getRequestConfig(async () => {
  const locale = matchLocale(parseAcceptLanguage((await headers()).get("accept-language")));
  const messages = (await import(`@sinema/shared/messages/${locale}.json`)).default;
  return { locale, messages, timeZone: CINEMA_TIME_ZONE };
});

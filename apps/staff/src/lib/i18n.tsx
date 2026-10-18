import { CINEMA_TIME_ZONE, type Locale, matchLocale } from "@sinema/shared";
import en from "@sinema/shared/messages/en.json";
import tr from "@sinema/shared/messages/tr.json";
import { useLocales } from "expo-localization";
import type { ReactNode } from "react";
import { IntlProvider } from "use-intl";

const messages: Record<Locale, typeof en> = { en, tr };

/** English or Turkish from the phone's language list; updates when the user changes it. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const locales = useLocales();
  const locale = matchLocale(locales.map((l) => l.languageTag));
  return (
    <IntlProvider locale={locale} messages={messages[locale]} timeZone={CINEMA_TIME_ZONE}>
      {children}
    </IntlProvider>
  );
}

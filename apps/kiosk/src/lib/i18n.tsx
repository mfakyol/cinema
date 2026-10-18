import { CINEMA_TIME_ZONE, type Locale } from "@sinema/shared";
import en from "@sinema/shared/messages/en.json";
import tr from "@sinema/shared/messages/tr.json";
import type { ReactNode } from "react";
import { IntlProvider } from "use-intl";
import { locale } from "./locale";

const messages: Record<Locale, typeof en> = { en, tr };

export function I18nProvider({ children }: { children: ReactNode }) {
  return (
    <IntlProvider locale={locale} messages={messages[locale]} timeZone={CINEMA_TIME_ZONE}>
      {children}
    </IntlProvider>
  );
}

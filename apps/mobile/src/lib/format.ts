import { errorCode } from "@sinema/client";
import { CURRENCY } from "@sinema/shared";
import { useFormatter, useTranslations } from "use-intl";

/** Formats an amount in minor units (cents) in the viewer's language. */
export function usePrice() {
  const format = useFormatter();
  return (minor: number) => format.number(minor / 100, { style: "currency", currency: CURRENCY });
}

/** Turns any thrown error into a translated, user-facing sentence. */
export function useErrorMessage() {
  const t = useTranslations("errors");
  return (error: unknown) => {
    const code = errorCode(error);
    return t.has(code) ? t(code) : t("generic");
  };
}

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CustomerDisplay } from "./customer-display";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("kiosk.display");
  return { title: t("title") };
}

/** The customer-facing side of the box office, opened from the staff screen on a second monitor. */
export default function CustomerDisplayPage() {
  return <CustomerDisplay />;
}

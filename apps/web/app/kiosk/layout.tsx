import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("kiosk");
  return { title: { default: t("title"), template: "%s · Sinema" }, robots: { index: false, follow: false } };
}

/** The box office fills the screen: no site header or footer. */
export default function KioskLayout({ children }: LayoutProps<"/kiosk">) {
  return <div className="flex h-dvh flex-col overflow-hidden">{children}</div>;
}

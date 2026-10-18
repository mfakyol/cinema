import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";

/** The public website: header, page and the TMDB credit. The kiosk has its own frame. */
export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const t = await getTranslations("common");
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      <footer className="mx-auto w-full max-w-5xl px-4 pb-8 text-xs text-muted-foreground">
        {t("tmdbAttribution")}
      </footer>
    </>
  );
}

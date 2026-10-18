import { getTranslations } from "next-intl/server";
import { MovieGrid } from "./movie-grid";

export default async function HomePage() {
  const t = await getTranslations("home");
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>
      <MovieGrid />
    </div>
  );
}

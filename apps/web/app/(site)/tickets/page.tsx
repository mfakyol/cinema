import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TicketList } from "./ticket-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tickets");
  return { title: t("title") };
}

export default async function TicketsPage() {
  const t = await getTranslations("tickets");
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
      <TicketList />
    </div>
  );
}

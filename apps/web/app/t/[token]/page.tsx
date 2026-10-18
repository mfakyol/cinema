import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TicketView } from "./ticket-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tickets");
  // The link is the ticket; keep these pages out of search results.
  return { title: t("ticketTitle"), robots: { index: false, follow: false } };
}

/** Opens when a phone camera scans a ticket's QR code. */
export default async function TicketPage({ params }: PageProps<"/t/[token]">) {
  const { token } = await params;
  return <TicketView token={token} />;
}

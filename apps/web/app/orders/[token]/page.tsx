import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OrderTickets } from "./order-tickets";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("order");
  // The link is a credential; keep these pages out of search results.
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function OrderPage({ params }: PageProps<"/orders/[token]">) {
  const { token } = await params;
  return <OrderTickets token={token} />;
}

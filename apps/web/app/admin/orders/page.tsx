import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OrdersAdmin } from "./orders-admin";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin"))("orders") };
}

export default function OrdersPage() {
  return <OrdersAdmin />;
}

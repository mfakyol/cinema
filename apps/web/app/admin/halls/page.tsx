import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { HallsAdmin } from "./halls-admin";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin"))("halls") };
}

export default function HallsPage() {
  return <HallsAdmin />;
}

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ShowtimesAdmin } from "./showtimes-admin";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin"))("showtimes") };
}

export default function ShowtimesPage() {
  return <ShowtimesAdmin />;
}

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LayoutList } from "./layout-list";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin"))("layouts") };
}

export default function LayoutsPage() {
  return <LayoutList />;
}

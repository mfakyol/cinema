import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LayoutEditor } from "../layout-editor";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin"))("newLayout") };
}

export default function NewLayoutPage() {
  return <LayoutEditor />;
}

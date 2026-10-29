import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EditLayout } from "./edit-layout";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin"))("editLayout") };
}

export default async function EditLayoutPage({ params }: PageProps<"/admin/layouts/[id]">) {
  const { id } = await params;
  return <EditLayout id={id} />;
}

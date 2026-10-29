import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminFrame } from "./admin-frame";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: { default: t("title"), template: `%s · ${t("title")}` }, robots: { index: false, follow: false } };
}

/** The admin panel has its own frame and sign-in, apart from the public site. */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <AdminFrame>{children}</AdminFrame>;
}

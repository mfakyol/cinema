import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { VoucherView } from "./voucher-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("concessions");
  // The link is the item; keep these pages out of search results.
  return { title: t("itemTitle"), robots: { index: false, follow: false } };
}

/** Opens when a phone camera scans a snack or drink's QR code. */
export default async function VoucherPage({ params }: PageProps<"/c/[token]">) {
  const { token } = await params;
  return <VoucherView token={token} />;
}

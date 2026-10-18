"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LoadError } from "@/components/load-error";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { VoucherCard } from "@/components/voucher-card";
import { ApiError, apiFetch, type ConcessionVoucher } from "@/lib/api";

/** The page an item's QR code opens: the code itself, large, and what it is for. */
export function VoucherView({ token }: { token: string }) {
  const t = useTranslations();
  const query = useQuery({
    queryKey: ["voucher", token],
    queryFn: () => apiFetch<{ voucher: ConcessionVoucher }>(`/concessions/${encodeURIComponent(token)}`),
  });

  if (query.error instanceof ApiError && query.error.status === 404) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertDescription>{t("concessions.notFound")}</AlertDescription>
        </Alert>
        <Button asChild>
          <Link href="/">{t("tickets.browse")}</Link>
        </Button>
      </div>
    );
  }
  if (query.isError) return <LoadError onRetry={() => void query.refetch()} />;
  if (query.isPending) return <Skeleton className="mx-auto h-96 w-full max-w-md" />;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">{t("concessions.itemTitle")}</h1>
      <VoucherCard voucher={query.data.voucher} large />
    </div>
  );
}

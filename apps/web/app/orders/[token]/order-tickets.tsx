"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LoadError } from "@/components/load-error";
import { TicketCard } from "@/components/ticket-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiFetch, type OrderPage } from "@/lib/api";

/** The tickets behind an emailed order link; works on any device, without signing in. */
export function OrderTickets({ token }: { token: string }) {
  const t = useTranslations();
  const order = useQuery({
    queryKey: ["order", token],
    queryFn: () => apiFetch<{ order: OrderPage }>(`/orders/${encodeURIComponent(token)}`),
  });

  if (order.error instanceof ApiError && order.error.status === 404) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertDescription>{t("order.notFound")}</AlertDescription>
        </Alert>
        <Button asChild>
          <Link href="/">{t("tickets.browse")}</Link>
        </Button>
      </div>
    );
  }
  if (order.isError) return <LoadError onRetry={() => void order.refetch()} />;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">{t("order.title")}</h1>
        {order.data && (
          <p className="text-muted-foreground">{t("order.sentTo", { email: order.data.order.email })}</p>
        )}
      </div>
      {order.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {order.data.order.tickets.map((ticket) => (
            <li key={ticket.id}>
              <TicketCard ticket={ticket} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

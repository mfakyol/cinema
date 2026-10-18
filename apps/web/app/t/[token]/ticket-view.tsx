"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LoadError } from "@/components/load-error";
import { TicketActions } from "@/components/ticket-actions";
import { TicketPass, TicketPassExports } from "@/components/ticket-pass";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiFetch, type Ticket } from "@/lib/api";

/** The page a ticket's QR code opens: the code itself, large, and everything about the ticket. */
export function TicketView({ token }: { token: string }) {
  const t = useTranslations();
  const query = useQuery({
    queryKey: ["ticket", token],
    queryFn: () => apiFetch<{ ticket: Ticket }>(`/tickets/${encodeURIComponent(token)}`),
  });

  if (query.error instanceof ApiError && query.error.status === 404) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertDescription>{t("tickets.notFound")}</AlertDescription>
        </Alert>
        <Button asChild>
          <Link href="/">{t("tickets.browse")}</Link>
        </Button>
      </div>
    );
  }
  if (query.isError) return <LoadError onRetry={() => void query.refetch()} />;
  if (query.isPending) return <Skeleton className="mx-auto h-[32rem] w-full max-w-md" />;

  const { ticket } = query.data;
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">{t("tickets.ticketTitle")}</h1>
      <TicketPass ticket={ticket} />
      <TicketActions ticket={ticket} />
      <TicketPassExports tickets={[ticket]} />
    </div>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LoadError } from "@/components/load-error";
import { TicketCard } from "@/components/ticket-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, type Ticket } from "@/lib/api";
import { useSession } from "@/lib/session";

export function TicketList() {
  const t = useTranslations();
  const session = useSession();

  const tickets = useQuery({
    queryKey: ["tickets", session?.token],
    queryFn: () => apiFetch<{ tickets: Ticket[] }>("/me/tickets"),
    enabled: Boolean(session),
  });

  if (tickets.isError) return <LoadError onRetry={() => void tickets.refetch()} />;
  // Without a session nothing was bought on this device yet.
  if (session && tickets.isPending) return <Skeleton className="h-48 w-full" />;

  if (!tickets.data || tickets.data.tickets.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">{t("tickets.empty")}</p>
        <Button asChild>
          <Link href="/">{t("tickets.browse")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {tickets.data.tickets.map((ticket) => (
        <li key={ticket.id}>
          <TicketCard ticket={ticket} />
        </li>
      ))}
    </ul>
  );
}

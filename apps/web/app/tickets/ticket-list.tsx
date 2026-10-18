"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { LoadError } from "@/components/load-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, type Ticket } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export function TicketList() {
  const t = useTranslations();
  const format = useFormatter();
  const session = useSession();

  const tickets = useQuery({
    queryKey: ["tickets", session?.user.id],
    queryFn: () => apiFetch<{ tickets: Ticket[] }>("/me/tickets"),
    enabled: Boolean(session),
  });

  if (!session) {
    return (
      <Button asChild>
        <Link href="/login?next=/tickets">{t("common.signIn")}</Link>
      </Button>
    );
  }
  if (tickets.isError) return <LoadError onRetry={() => void tickets.refetch()} />;
  if (tickets.isPending) return <Skeleton className="h-48 w-full" />;

  if (tickets.data.tickets.length === 0) {
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
      {tickets.data.tickets.map((ticket) => {
        const valid = ticket.status === "PAID";
        return (
          <li key={ticket.id}>
            <Card className={cn(!valid && "opacity-60")}>
              <CardContent className="flex gap-4 pt-6">
                {/* The code stays black on white in both themes so scanners can read it. */}
                <div className="shrink-0 rounded-md bg-white p-2">
                  <QRCodeSVG value={ticket.qrToken} size={112} aria-label={t("tickets.showAtEntrance")} />
                </div>
                <div className="min-w-0 space-y-1">
                  <Badge variant={valid ? "default" : "secondary"}>
                    {t(`tickets.status.${ticket.status}`)}
                  </Badge>
                  <p className="truncate font-semibold">{ticket.showtime.movie.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {format.dateTime(new Date(ticket.showtime.startsAt), {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {ticket.showtime.hall.name} ·{" "}
                    {t("seats.seatLabel", { row: ticket.seat.row, number: ticket.seat.number })}
                  </p>
                  {valid && <p className="text-xs text-muted-foreground">{t("tickets.showAtEntrance")}</p>}
                </div>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

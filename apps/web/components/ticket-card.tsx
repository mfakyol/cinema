"use client";

import { useFormatter, useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Ticket } from "@/lib/api";
import { cn } from "@/lib/utils";

export function TicketCard({ ticket }: { ticket: Ticket }) {
  const t = useTranslations();
  const format = useFormatter();
  const valid = ticket.status === "PAID";

  return (
    <Card className={cn(!valid && "opacity-60")}>
      <CardContent className="flex gap-4 pt-6">
        {/* The code stays black on white in both themes so scanners can read it. */}
        <div className="shrink-0 rounded-md bg-white p-2">
          <QRCodeSVG value={ticket.qrToken} size={112} aria-label={t("tickets.showAtEntrance")} />
        </div>
        <div className="min-w-0 space-y-1">
          <Badge variant={valid ? "default" : "secondary"}>{t(`tickets.status.${ticket.status}`)}</Badge>
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
  );
}

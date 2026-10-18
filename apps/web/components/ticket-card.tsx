"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Ticket } from "@/lib/api";
import { ticketQrValue } from "@/lib/site";
import { cn } from "@/lib/utils";

/** A ticket with its QR code; `actions` renders under the details, e.g. a download button. */
export function TicketCard({ ticket, actions }: { ticket: Ticket; actions?: ReactNode }) {
  const t = useTranslations();
  const format = useFormatter();
  const valid = ticket.status === "PAID";

  return (
    <Card className={cn(!valid && "opacity-60")}>
      <CardContent className="flex gap-4 pt-6">
        {/* The code stays black on white in both themes so scanners can read it. */}
        <div className="size-32 shrink-0 self-start rounded-md bg-white p-2">
          <QRCodeSVG value={ticketQrValue(ticket.qrToken)} size={112} aria-label={t("tickets.showAtEntrance")} />
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
          {actions && <div className="-ml-3 pt-1">{actions}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

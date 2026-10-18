"use client";

import { Clapperboard } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Ticket } from "@/lib/api";
import { ticketQrValue } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * A ticket's full view: large QR code and every detail. The ticket page shows it, and image
 * and PDF downloads are pictures of it, so all of them look the same.
 */
export function TicketPass({ ticket, className }: { ticket: Ticket; className?: string }) {
  const t = useTranslations();
  const format = useFormatter();
  const startsAt = new Date(ticket.showtime.startsAt);
  const valid = ticket.status === "PAID";
  const details: [string, string][] = [
    [
      t("tickets.details.date"),
      format.dateTime(startsAt, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    ],
    [t("tickets.details.time"), format.dateTime(startsAt, { hour: "2-digit", minute: "2-digit" })],
    [t("tickets.details.hall"), ticket.showtime.hall.name],
    [t("tickets.details.seat"), t("seats.seatLabel", { row: ticket.seat.row, number: ticket.seat.number })],
    [t("tickets.details.seatType"), ticket.seat.type === "VIP" ? t("seats.vip") : t("tickets.details.standard")],
    [t("tickets.details.duration"), t("common.minutes", { count: ticket.showtime.movie.durationMin })],
    [t("tickets.details.statusLabel"), t(`tickets.status.${ticket.status}`)],
  ];

  return (
    <Card className={cn(!valid && "opacity-70", className)}>
      <CardContent className="space-y-6 pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
              <Clapperboard className="size-4" aria-hidden />
              {t("common.appName")}
            </p>
            <p className="text-2xl font-bold tracking-tight">{ticket.showtime.movie.title}</p>
          </div>
          <Badge variant={valid ? "default" : "secondary"}>{t(`tickets.status.${ticket.status}`)}</Badge>
        </div>

        <div className="mx-auto aspect-square w-full max-w-64 rounded-lg bg-white p-3">
          {/* Black on white in both themes so gate scanners can read it. */}
          <QRCodeSVG
            value={ticketQrValue(ticket.qrToken)}
            size={256}
            className="size-full"
            aria-label={t("tickets.showAtEntrance")}
          />
        </div>
        {valid && <p className="text-center text-sm text-muted-foreground">{t("tickets.showAtEntrance")}</p>}

        <dl className="divide-y text-sm">
          {details.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-2">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

const exportId = (ticketId: string) => `ticket-export-${ticketId}`;

/**
 * Off-screen copies of the passes for image and PDF downloads, always in the light theme
 * so prints and scans look the same whatever theme the viewer uses.
 */
export function TicketPassExports({ tickets }: { tickets: Ticket[] }) {
  return (
    <div aria-hidden className="pointer-events-none fixed top-0 -left-[10000px]" inert>
      {tickets.map((ticket) => (
        <div key={ticket.id} id={exportId(ticket.id)} className="theme-light w-[420px] bg-background p-6 text-foreground">
          <TicketPass ticket={ticket} />
        </div>
      ))}
    </div>
  );
}

/** The off-screen pass for a ticket; TicketPassExports must be on the page. */
export function exportedPass(ticketId: string): HTMLElement {
  const node = document.getElementById(exportId(ticketId));
  if (!node) throw new Error(`No export copy for ticket ${ticketId}`);
  return node;
}

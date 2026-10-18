"use client";

import { CalendarPlus, FileDown, ImageDown, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { exportedPass } from "@/components/ticket-pass";
import { Button } from "@/components/ui/button";
import type { OrderPage, Ticket } from "@/lib/api";
import { canvasesToPdf, canvasToPng, downloadBlob, slug } from "@/lib/downloads";
import { buildIcs } from "@/lib/ics";
import { ticketQrValue } from "@/lib/site";

/** A picture of the ticket's pass exactly as the ticket page draws it. */
async function captureTicket(ticket: Ticket): Promise<HTMLCanvasElement> {
  const { toCanvas } = await import("html-to-image");
  return toCanvas(exportedPass(ticket.id), { pixelRatio: 3, cacheBust: true });
}

/** Runs a download action with a busy flag and a toast when it fails. */
function useBusyAction() {
  const t = useTranslations("errors");
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      console.error(error);
      toast.error(t("generic"));
    } finally {
      setBusy(false);
    }
  };
  return [busy, run] as const;
}

/**
 * Opens the system share sheet, or copies the link where there is none (most desktop browsers).
 * Returns quietly when the person closes the sheet.
 */
export async function shareLink(data: { title: string; text: string; url: string }, copiedMessage: string) {
  if (navigator.share) {
    try {
      await navigator.share(data);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      throw error;
    }
    return;
  }
  await navigator.clipboard.writeText(data.url);
  toast.success(copiedMessage);
}

const ticketFileName = (ticket: Ticket) =>
  `${slug(ticket.showtime.movie.title)}-${ticket.seat.row}${ticket.seat.number}`;

export function SaveTicketImageButton({ ticket }: { ticket: Ticket }) {
  const t = useTranslations("order");
  const [busy, run] = useBusyAction();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy}
      onClick={() =>
        run(async () => downloadBlob(await canvasToPng(await captureTicket(ticket)), `${ticketFileName(ticket)}.png`))
      }
    >
      <ImageDown aria-hidden />
      {t("saveImage")}
    </Button>
  );
}

/**
 * Shares one ticket's own link, so a friend gets just their seat's QR code and details,
 * not the whole order.
 */
export function ShareTicketButton({ ticket }: { ticket: Ticket }) {
  const t = useTranslations();
  const [busy, run] = useBusyAction();
  const seat = t("seats.seatLabel", { row: ticket.seat.row, number: ticket.seat.number });
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy}
      onClick={() =>
        run(() =>
          shareLink(
            {
              title: ticket.showtime.movie.title,
              text: t("order.shareTicketText", { movie: ticket.showtime.movie.title, seat }),
              url: ticketQrValue(ticket.qrToken),
            },
            t("order.linkCopied"),
          ),
        )
      }
    >
      <Share2 aria-hidden />
      {t("order.shareTicket")}
    </Button>
  );
}

/** Both per-ticket actions, side by side. */
export function TicketActions({ ticket }: { ticket: Ticket }) {
  return (
    <div className="flex flex-wrap">
      <SaveTicketImageButton ticket={ticket} />
      <ShareTicketButton ticket={ticket} />
    </div>
  );
}

export function OrderActions({ order }: { order: OrderPage }) {
  const t = useTranslations();
  const [busy, run] = useBusyAction();
  const first = order.tickets[0];
  if (!first) return null;

  const { movie, hall, startsAt } = first.showtime;
  // Short seat codes ("E5, E6") read better in a calendar entry than full labels.
  const seats = order.tickets.map((ticket) => `${ticket.seat.row}${ticket.seat.number}`).join(", ");

  const downloadPdf = () =>
    run(async () => {
      // One at a time: each capture clones its pass and inlines fonts and styles.
      const canvases: HTMLCanvasElement[] = [];
      for (const ticket of order.tickets) canvases.push(await captureTicket(ticket));
      downloadBlob(await canvasesToPdf(canvases), `${slug(movie.title)}-tickets.pdf`);
    });

  const addToCalendar = () =>
    run(async () => {
      const start = new Date(startsAt);
      const ics = buildIcs({
        uid: `${order.id}@sinema`,
        title: movie.title,
        start,
        end: new Date(start.getTime() + movie.durationMin * 60_000),
        location: hall.name,
        description: t("order.calendarDescription", { seats, link: window.location.href }),
        url: window.location.href,
      });
      downloadBlob(new Blob([ics], { type: "text/calendar;charset=utf-8" }), `${slug(movie.title)}.ics`);
    });

  const share = () =>
    run(() =>
      shareLink(
        { title: movie.title, text: t("order.shareText", { movie: movie.title }), url: window.location.href },
        t("order.linkCopied"),
      ),
    );

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={busy} onClick={downloadPdf}>
        <FileDown aria-hidden />
        {t("order.downloadPdf")}
      </Button>
      <Button variant="outline" disabled={busy} onClick={addToCalendar}>
        <CalendarPlus aria-hidden />
        {t("order.addToCalendar")}
      </Button>
      <Button variant="outline" disabled={busy} onClick={share}>
        <Share2 aria-hidden />
        {t("order.share")}
      </Button>
    </div>
  );
}

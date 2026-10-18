"use client";

import { groupBy } from "@sinema/shared";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SeatMapSeat } from "@/lib/api";
import { cn } from "@/lib/utils";

const seatStyles = {
  free: "border border-border bg-secondary text-secondary-foreground hover:bg-primary/25",
  mine: "bg-primary text-primary-foreground",
  taken: "cursor-not-allowed bg-foreground/15 text-foreground/50",
} as const;

type SeatLook = keyof typeof seatStyles;

function lookOf(seat: SeatMapSeat): SeatLook {
  if (seat.lockId) return "mine";
  return seat.state === "free" ? "free" : "taken";
}

/**
 * The hall's seat map as its layout draws it: every row spans `columns` cells, aisles stay
 * empty, and short rows keep the indent the layout gives them. Without `onToggle` it is
 * read-only, as on the box office's customer screen.
 */
export function SeatGrid({
  seats,
  columns,
  busySeatId = null,
  onToggle,
}: {
  seats: SeatMapSeat[];
  columns: number;
  busySeatId?: string | null;
  onToggle?: (seat: SeatMapSeat) => void;
}) {
  const t = useTranslations("seats");
  const rows = groupBy(seats, (seat) => seat.row);
  const cell = "size-7 sm:size-8";

  return (
    <div className="space-y-6">
      <div className="mx-auto w-4/5">
        <div className="h-2 rounded-t-full bg-gradient-to-b from-primary/60 to-transparent" />
        <p className="mt-1 text-center text-xs uppercase tracking-widest text-muted-foreground">{t("screen")}</p>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="mx-auto w-max space-y-1.5">
          {[...rows].map(([row, rowSeats]) => {
            const byColumn = new Map(rowSeats.map((seat) => [seat.column, seat]));
            return (
              <div key={row} className="flex items-center gap-1.5">
                <span className="w-5 text-center text-xs font-medium text-muted-foreground">{row}</span>
                {Array.from({ length: columns }, (_, column) => {
                  const seat = byColumn.get(column);
                  // An aisle or the space beside a short row.
                  if (!seat) return <span key={column} aria-hidden className={cell} />;
                  const look = lookOf(seat);
                  const wheelchair = seat.type === "WHEELCHAIR";
                  return (
                    <button
                      key={column}
                      type="button"
                      disabled={!onToggle || look === "taken" || busySeatId !== null}
                      aria-pressed={look === "mine"}
                      aria-label={`${t("seatLabel", { row: seat.row, number: seat.number })}, ${t(
                        look === "taken" ? "taken" : look === "mine" ? "mine" : "free",
                      )}${wheelchair ? `, ${t("wheelchair")}` : ""}`}
                      onClick={() => onToggle?.(seat)}
                      className={cn(
                        cell,
                        "rounded-t-lg rounded-b-sm text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        seatStyles[look],
                        !onToggle && "pointer-events-none",
                        wheelchair && look !== "taken" && "ring-2 ring-primary/70",
                        busySeatId === seat.id && "animate-pulse",
                      )}
                    >
                      {look === "taken" ? (
                        <X className="mx-auto size-3.5" aria-hidden />
                      ) : wheelchair ? (
                        <span aria-hidden>♿</span>
                      ) : (
                        seat.number
                      )}
                    </button>
                  );
                })}
                <span className="w-5 text-center text-xs font-medium text-muted-foreground">{row}</span>
              </div>
            );
          })}
        </div>
      </div>

      <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        {(
          [
            ["free", seatStyles.free, t("free")],
            ["mine", seatStyles.mine, t("mine")],
            ["taken", seatStyles.taken, t("taken")],
            ["wheelchair", "border border-border bg-secondary ring-2 ring-primary/70", t("wheelchair")],
          ] as const
        ).map(([key, style, label]) => (
          <li key={key} className="flex items-center gap-2">
            <span aria-hidden className={cn("size-4 rounded-t-md rounded-b-sm", style)} />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

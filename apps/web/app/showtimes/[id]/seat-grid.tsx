"use client";

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

export function SeatGrid({
  seats,
  busySeatId,
  onToggle,
}: {
  seats: SeatMapSeat[];
  busySeatId: string | null;
  onToggle: (seat: SeatMapSeat) => void;
}) {
  const t = useTranslations("seats");
  const rows = Map.groupBy(seats, (seat) => seat.row);

  return (
    <div className="space-y-6">
      <div className="mx-auto w-4/5">
        <div className="h-2 rounded-t-full bg-gradient-to-b from-primary/60 to-transparent" />
        <p className="mt-1 text-center text-xs uppercase tracking-widest text-muted-foreground">
          {t("screen")}
        </p>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="mx-auto w-max space-y-2">
          {[...rows].map(([row, rowSeats]) => (
            <div key={row} className="flex items-center gap-2">
              <span className="w-5 text-center text-xs font-medium text-muted-foreground">{row}</span>
              <div className="flex gap-1.5">
                {rowSeats.map((seat) => {
                  const look = lookOf(seat);
                  return (
                    <button
                      key={seat.id}
                      type="button"
                      disabled={look === "taken" || busySeatId !== null}
                      aria-pressed={look === "mine"}
                      aria-label={`${t("seatLabel", { row: seat.row, number: seat.number })}, ${t(
                        look === "taken" ? "taken" : look === "mine" ? "mine" : "free",
                      )}${seat.type === "VIP" ? `, ${t("vip")}` : ""}`}
                      onClick={() => onToggle(seat)}
                      className={cn(
                        "size-8 rounded-t-lg rounded-b-sm text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:size-9",
                        seatStyles[look],
                        seat.type === "VIP" && look !== "taken" && "ring-2 ring-amber-400/80",
                        busySeatId === seat.id && "animate-pulse",
                      )}
                    >
                      {look === "taken" ? <X className="mx-auto size-3.5" aria-hidden /> : seat.number}
                    </button>
                  );
                })}
              </div>
              <span className="w-5 text-center text-xs font-medium text-muted-foreground">{row}</span>
            </div>
          ))}
        </div>
      </div>

      <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        {(
          [
            ["free", seatStyles.free, t("free")],
            ["mine", seatStyles.mine, t("mine")],
            ["taken", seatStyles.taken, t("taken")],
            ["vip", "border border-border bg-secondary ring-2 ring-amber-400/80", t("vip")],
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

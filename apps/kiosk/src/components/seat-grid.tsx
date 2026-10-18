import { groupBy, type SeatMapSeat } from "@sinema/shared";
import { X } from "lucide-react";
import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "use-intl";
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

/** Seat size when the map does not fill its box. */
const DEFAULT_CELL = 36;
const MIN_CELL = 12;
/** Gap between seats, as a share of a seat. */
const GAP_RATIO = 0.18;

/**
 * Watches an element's content size, for drawing the seats as large as the space allows. The
 * first reading happens before the browser paints, so a freshly mounted map (a step sliding
 * in) never shows at a default size first and then jumps. Transforms such as the slide do not
 * change the reading.
 */
function useBoxSize(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      const width = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const height = element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      // Same size again (the observer fires once on start): keep the state so nothing re-renders.
      setSize((previous) =>
        previous && previous.width === width && previous.height === height ? previous : { width, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled]);
  return { ref, size };
}

/**
 * The hall's seat map as its layout draws it: every row spans `columns` cells, aisles stay
 * empty, and short rows keep the indent the layout gives them. With `fill` the seats grow to
 * take all the space the parent gives, as on the customer's touchscreen. Without `onToggle`
 * it is read-only.
 */
export function SeatGrid({
  seats,
  columns,
  busySeatId = null,
  onToggle,
  fill = false,
}: {
  seats: SeatMapSeat[];
  columns: number;
  busySeatId?: string | null;
  onToggle?: (seat: SeatMapSeat) => void;
  fill?: boolean;
}) {
  const t = useTranslations("seats");
  const rows = [...groupBy(seats, (seat) => seat.row)];
  const { ref, size } = useBoxSize(fill);

  // A row is the seats plus a label at each end; fit them across and the rows down.
  const across = columns + 2;
  const down = Math.max(rows.length, 1);
  const cell =
    fill && size
      ? Math.max(
          MIN_CELL,
          Math.floor(
            Math.min(
              size.width / (across + (across - 1) * GAP_RATIO),
              size.height / (down + (down - 1) * GAP_RATIO),
            ),
          ),
        )
      : DEFAULT_CELL;
  const gap = Math.round(cell * GAP_RATIO);
  const cellStyle: CSSProperties = { width: cell, height: cell, fontSize: Math.max(9, cell * 0.36) };

  return (
    <div className={cn("flex flex-col gap-6", fill && "h-full min-h-0")}>
      <div className="mx-auto w-4/5 shrink-0">
        <div className="h-2 rounded-t-full bg-gradient-to-b from-primary/60 to-transparent" />
        <p className="mt-1 text-center text-xs uppercase tracking-widest text-muted-foreground">{t("screen")}</p>
      </div>

      {/* Padding keeps rings and focus outlines inside the clipped area; the size excludes it. */}
      <div ref={ref} className={cn("flex p-3", fill ? "min-h-0 flex-1 overflow-hidden" : "overflow-x-auto")}>
        {/* Until measured, a filling map stays invisible rather than flash at the default size. */}
        <div className={cn("m-auto flex w-max flex-col", fill && !size && "invisible")} style={{ gap }}>
          {rows.map(([row, rowSeats]) => {
            const byColumn = new Map(rowSeats.map((seat) => [seat.column, seat]));
            const label = (
              <span
                className="grid place-items-center font-medium text-muted-foreground"
                style={{ ...cellStyle, fontSize: Math.max(9, cell * 0.4) }}
              >
                {row}
              </span>
            );
            return (
              <div key={row} className="flex items-center" style={{ gap }}>
                {label}
                {Array.from({ length: columns }, (_, column) => {
                  const seat = byColumn.get(column);
                  // An aisle or the space beside a short row.
                  if (!seat) return <span key={column} aria-hidden style={cellStyle} />;
                  const look = lookOf(seat);
                  const wheelchair = seat.type === "WHEELCHAIR";
                  return (
                    <button
                      key={column}
                      type="button"
                      style={cellStyle}
                      disabled={!onToggle || look === "taken" || busySeatId !== null}
                      aria-pressed={look === "mine"}
                      aria-label={`${t("seatLabel", { row: seat.row, number: seat.number })}, ${t(
                        look === "taken" ? "taken" : look === "mine" ? "mine" : "free",
                      )}${wheelchair ? `, ${t("wheelchair")}` : ""}`}
                      onClick={() => onToggle?.(seat)}
                      className={cn(
                        "grid place-items-center rounded-t-[30%] rounded-b-[12%] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        seatStyles[look],
                        !onToggle && "pointer-events-none",
                        wheelchair && look !== "taken" && "ring-2 ring-primary/70",
                        busySeatId === seat.id && "animate-pulse",
                      )}
                    >
                      {look === "taken" ? (
                        <X className="size-[45%]" aria-hidden />
                      ) : wheelchair ? (
                        <span aria-hidden>♿</span>
                      ) : (
                        seat.number
                      )}
                    </button>
                  );
                })}
                {label}
              </div>
            );
          })}
        </div>
      </div>

      <ul className="flex shrink-0 flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
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

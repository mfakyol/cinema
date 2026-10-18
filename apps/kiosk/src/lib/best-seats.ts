import { groupBy, type SeatMapSeat } from "@sinema/shared";

/**
 * The best `count` free seats side by side, for "two seats, please" at the counter. Seats count
 * as side by side when no aisle or taken seat separates them. The best block sits a little
 * behind the middle of the hall and as near the centre of its row as possible; wheelchair
 * spaces are only used when nothing else fits. Null when no block is free.
 */
export function bestSeats(seats: SeatMapSeat[], columns: number, count: number): SeatMapSeat[] | null {
  const rows = [...groupBy(seats, (seat) => seat.row).values()];
  // About 60% of the way back is where most people like to sit.
  const idealRow = (rows.length - 1) * 0.6;
  const centre = (columns - 1) / 2;
  let best: { seats: SeatMapSeat[]; score: number } | null = null;

  rows.forEach((rowSeats, rowIndex) => {
    const ordered = [...rowSeats].sort((a, b) => a.column - b.column);
    let run: SeatMapSeat[] = [];
    const consider = () => {
      for (let start = 0; start + count <= run.length; start++) {
        const block = run.slice(start, start + count);
        const middle = (block[0]!.column + block[block.length - 1]!.column) / 2;
        const score =
          (Math.abs(rowIndex - idealRow) / Math.max(rows.length, 1)) * 2 +
          Math.abs(middle - centre) / Math.max(columns, 1) +
          (block.some((seat) => seat.type === "WHEELCHAIR") ? 10 : 0);
        if (!best || score < best.score) best = { seats: block, score };
      }
    };
    for (const seat of ordered) {
      const free = seat.state === "free" && !seat.lockId;
      const adjacent = run.length > 0 && seat.column === run[run.length - 1]!.column + 1;
      if (free && (run.length === 0 || adjacent)) {
        run.push(seat);
      } else {
        consider();
        run = free ? [seat] : [];
      }
    }
    consider();
  });

  return (best as { seats: SeatMapSeat[] } | null)?.seats ?? null;
}

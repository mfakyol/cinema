/**
 * A hall's seating plan, row by row from the screen backwards. Each row is a string of cells:
 *
 *   S  seat      W  wheelchair space      _  aisle or empty space
 *
 * e.g. { label: "A", cells: "WSSSS_SSSSW" }. Rows may differ in length; leading "_" cells
 * indent a row. Seats are numbered 1, 2, 3… from the left, skipping empty cells, and every
 * cell keeps its column so clients can draw aisles where the plan has them.
 */
export interface LayoutRow {
  label: string;
  cells: string;
}

export type LayoutSeatType = "STANDARD" | "WHEELCHAIR";

export interface LayoutSeat {
  row: string;
  number: number;
  /** Zero-based cell index in the row, counting empty cells. */
  column: number;
  type: LayoutSeatType;
}

const CELL_TYPES: Record<string, LayoutSeatType | null> = {
  S: "STANDARD",
  W: "WHEELCHAIR",
  _: null,
};

export class LayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LayoutError";
  }
}

/** The seats a plan describes; throws LayoutError on unknown cells, empty or repeated rows. */
export function seatsFromLayout(rows: readonly LayoutRow[]): LayoutSeat[] {
  if (rows.length === 0) throw new LayoutError("A layout needs at least one row");
  const labels = new Set<string>();
  const seats: LayoutSeat[] = [];

  for (const { label, cells } of rows) {
    if (!label.trim()) throw new LayoutError("Every row needs a label");
    if (labels.has(label)) throw new LayoutError(`Row ${label} appears twice`);
    labels.add(label);

    let number = 0;
    [...cells].forEach((cell, column) => {
      if (!(cell in CELL_TYPES)) throw new LayoutError(`Row ${label} has an unknown cell "${cell}"`);
      const type = CELL_TYPES[cell];
      if (type) seats.push({ row: label, number: ++number, column, type });
    });
    if (number === 0) throw new LayoutError(`Row ${label} has no seats`);
  }
  return seats;
}

/** The widest row, which sets how many columns a seat map draws. */
export const layoutColumns = (rows: readonly LayoutRow[]) => Math.max(...rows.map((row) => row.cells.length));

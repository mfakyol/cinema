import { LayoutError, type LayoutRow, seatsFromLayout } from "@sinema/shared";
import { prisma } from "../db.js";
import { HttpError } from "../lib/http-error.js";

/**
 * Rebuilds a hall's seats from a layout. Seats that tickets or locks point to cannot be
 * replaced, so a hall that has sold or held any seat keeps its plan.
 */
export async function applyLayout(hallId: string, layoutId: string) {
  const layout = await prisma.hallLayout.findUnique({ where: { id: layoutId } });
  if (!layout) throw new HttpError(404, "NOT_FOUND", "Layout not found");

  let seats;
  try {
    seats = seatsFromLayout(layout.rows as unknown as LayoutRow[]);
  } catch (error) {
    if (error instanceof LayoutError) throw new HttpError(400, "INVALID_LAYOUT", error.message);
    throw error;
  }

  const [tickets, locks] = await Promise.all([
    prisma.ticket.count({ where: { seat: { hallId } } }),
    prisma.seatLock.count({ where: { seat: { hallId } } }),
  ]);
  if (tickets > 0 || locks > 0) {
    throw new HttpError(409, "HALL_IN_USE", "Seats in this hall are sold or held; its layout cannot change");
  }

  await prisma.$transaction([
    prisma.seat.deleteMany({ where: { hallId } }),
    prisma.seat.createMany({ data: seats.map((seat) => ({ ...seat, hallId })) }),
    prisma.hall.update({ where: { id: hallId }, data: { layoutId } }),
  ]);
  return seats.length;
}

import {
  type AdminHall,
  type AdminLayout,
  type HallCreateInput,
  type HallUpdateInput,
  type LayoutInput,
  type LayoutRow,
  seatsFromLayout,
} from "@sinema/shared";
import { isUniqueViolation, prisma } from "../db.js";
import { invalidate } from "../infra/cache.js";
import { HttpError } from "../lib/http-error.js";
import { applyLayout } from "./layouts.js";

const nameTaken = (what: string) => new HttpError(409, "NAME_TAKEN", `A ${what} with this name already exists`);

/** Runs a write and turns a unique-name clash into 409 NAME_TAKEN. */
async function uniqueName<T>(what: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken(what);
    throw error;
  }
}

export async function listLayouts(): Promise<AdminLayout[]> {
  const layouts = await prisma.hallLayout.findMany({
    include: { _count: { select: { halls: true } } },
    orderBy: { name: "asc" },
  });
  return layouts.map(({ id, name, rows, _count }) => {
    const plan = rows as unknown as LayoutRow[];
    return { id, name, rows: plan, seatCount: seatsFromLayout(plan).length, hallCount: _count.halls };
  });
}

export async function getLayout(id: string): Promise<AdminLayout> {
  const layout = (await listLayouts()).find((candidate) => candidate.id === id);
  if (!layout) throw new HttpError(404, "NOT_FOUND", "Layout not found");
  return layout;
}

export async function createLayout(input: LayoutInput): Promise<AdminLayout> {
  const { id } = await uniqueName("layout", () =>
    prisma.hallLayout.create({ data: { name: input.name, rows: input.rows } }),
  );
  return getLayout(id);
}

/**
 * Saves a layout. Halls built from it keep their seats until the layout is applied to them
 * again, so a hall with sales is never changed behind anyone's back.
 */
export async function updateLayout(id: string, input: LayoutInput): Promise<AdminLayout> {
  await getLayout(id);
  await uniqueName("layout", () => prisma.hallLayout.update({ where: { id }, data: { name: input.name, rows: input.rows } }));
  return getLayout(id);
}

export async function deleteLayout(id: string): Promise<void> {
  const layout = await getLayout(id);
  if (layout.hallCount > 0) throw new HttpError(409, "LAYOUT_IN_USE", "Halls are built from this layout");
  await prisma.hallLayout.delete({ where: { id } });
}

export async function listHalls(): Promise<AdminHall[]> {
  const now = new Date();
  const halls = await prisma.hall.findMany({
    include: {
      layout: { select: { id: true, name: true } },
      _count: { select: { seats: true, showtimes: { where: { startsAt: { gt: now } } } } },
    },
    orderBy: { name: "asc" },
  });
  const sold = await prisma.ticket.groupBy({ by: ["showtimeId"], _count: true, where: { showtime: { hallId: { in: halls.map((hall) => hall.id) } } } });
  const hallsWithSales = new Set(
    (await prisma.showtime.findMany({ where: { id: { in: sold.map((row) => row.showtimeId) } }, select: { hallId: true } })).map(
      (showtime) => showtime.hallId,
    ),
  );
  return halls.map(({ id, name, formats, layout, _count }) => ({
    id,
    name,
    formats,
    layout,
    seatCount: _count.seats,
    upcomingShowtimes: _count.showtimes,
    hasSales: hallsWithSales.has(id),
  }));
}

async function getHall(id: string): Promise<AdminHall> {
  const hall = (await listHalls()).find((candidate) => candidate.id === id);
  if (!hall) throw new HttpError(404, "NOT_FOUND", "Hall not found");
  return hall;
}

export async function createHall(input: HallCreateInput): Promise<AdminHall> {
  const { id } = await uniqueName("hall", () => prisma.hall.create({ data: { name: input.name, formats: input.formats } }));
  if (input.layoutId) await applyLayout(id, input.layoutId);
  return getHall(id);
}

/**
 * Renames a hall or changes its formats. A format still used by an upcoming showtime cannot be
 * taken away; those showtimes would no longer be possible in this hall.
 */
export async function updateHall(id: string, input: HallUpdateInput): Promise<AdminHall> {
  const hall = await getHall(id);
  if (input.formats) {
    const removed = hall.formats.filter((format) => !input.formats!.includes(format));
    const affected = await prisma.showtime.count({
      where: { hallId: id, format: { in: removed }, startsAt: { gt: new Date() } },
    });
    if (affected > 0) {
      throw new HttpError(409, "FORMAT_IN_USE", "Upcoming showtimes in this hall use a format being removed");
    }
  }
  await uniqueName("hall", () => prisma.hall.update({ where: { id }, data: input }));
  // Hall names appear in every showtime list and seat map.
  const showtimes = await prisma.showtime.findMany({ where: { hallId: id }, select: { id: true } });
  await invalidate("showtimes", ...showtimes.map((showtime) => `seatmap:${showtime.id}`));
  return getHall(id);
}

/** Rebuilds a hall's seats from a layout; refused once the hall has sold or held seats. */
export async function setHallLayout(id: string, layoutId: string): Promise<AdminHall> {
  await getHall(id);
  await applyLayout(id, layoutId);
  return getHall(id);
}

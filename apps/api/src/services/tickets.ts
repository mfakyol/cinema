import { prisma } from "../db.js";
import { HttpError } from "../lib/http-error.js";
import { hasValidSignature } from "../lib/qr.js";

const ticketDetails = {
  seat: { select: { row: true, number: true, type: true } },
  showtime: {
    select: {
      id: true,
      startsAt: true,
      movie: { select: { id: true, title: true } },
      hall: { select: { id: true, name: true } },
    },
  },
} as const;

export async function listUserTickets(userId: string) {
  return prisma.ticket.findMany({
    where: { userId },
    include: ticketDetails,
    orderBy: [{ showtime: { startsAt: "desc" } }, { seat: { row: "asc" } }, { seat: { number: "asc" } }],
  });
}

/** Admits a ticket once: PAID becomes USED atomically, so two scanners cannot both admit it. */
export async function verifyTicket(qrToken: string) {
  if (!hasValidSignature(qrToken)) {
    throw new HttpError(400, "INVALID_QR", "This is not a valid ticket code");
  }
  const ticket = await prisma.ticket.findUnique({ where: { qrToken }, include: ticketDetails });
  if (!ticket) throw new HttpError(404, "NOT_FOUND", "Ticket not found");

  const admitted = await prisma.ticket.updateMany({
    where: { id: ticket.id, status: "PAID" },
    data: { status: "USED" },
  });
  if (admitted.count === 0) {
    const { status } = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
      select: { status: true },
    });
    throw status === "USED"
      ? new HttpError(409, "ALREADY_USED", "This ticket has already been used")
      : new HttpError(409, "TICKET_CANCELLED", "This ticket was cancelled");
  }
  return { ...ticket, status: "USED" as const };
}

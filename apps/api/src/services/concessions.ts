import { parseScan } from "@sinema/shared";
import { prisma } from "../db.js";
import { HttpError } from "../lib/http-error.js";
import { hasValidSignature } from "../lib/qr.js";

const voucherDetails = {
  id: true,
  qrToken: true,
  status: true,
  usedAt: true,
  orderItem: {
    select: {
      product: { select: { id: true, name: true, category: true } },
      order: {
        select: {
          tickets: {
            take: 1,
            select: {
              showtime: {
                select: {
                  id: true,
                  startsAt: true,
                  movie: { select: { id: true, title: true } },
                  hall: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

const findVoucher = (qrToken: string) =>
  prisma.concessionVoucher.findUnique({ where: { qrToken }, select: voucherDetails });

type VoucherRow = NonNullable<Awaited<ReturnType<typeof findVoucher>>>;

/** Flattens a voucher row: the product, and the showtime its order was for. */
function present(row: VoucherRow) {
  return {
    id: row.id,
    qrToken: row.qrToken,
    status: row.status,
    usedAt: row.usedAt,
    product: row.orderItem.product,
    showtime: row.orderItem.order.tickets[0]?.showtime ?? null,
  };
}

/** Concession vouchers bought by a user or a guest session, newest first. */
export async function listHolderVouchers(holderId: string) {
  const rows = await prisma.concessionVoucher.findMany({
    where: { orderItem: { order: { holderId, status: "PAID" } } },
    select: voucherDetails,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(present);
}

/** The vouchers of one order, in the order they were created. */
export async function listOrderVouchers(orderId: string) {
  const rows = await prisma.concessionVoucher.findMany({
    where: { orderItem: { orderId } },
    select: voucherDetails,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(present);
}

/** One voucher for its QR link, which opens without signing in; the signed code is the credential. */
export async function getVoucherByQrToken(qrToken: string) {
  if (!hasValidSignature(qrToken)) throw new HttpError(404, "NOT_FOUND", "Item not found");
  const row = await findVoucher(qrToken);
  if (!row) throw new HttpError(404, "NOT_FOUND", "Item not found");
  return present(row);
}

/** Hands an item over once: PAID becomes USED atomically, so two stand staff cannot both serve it. */
export async function collectVoucher(scanned: string) {
  // A ticket shown at the stand is turned away untouched, so it still works at the door.
  const { kind, qrToken } = parseScan(scanned);
  if (kind === "ticket") {
    throw new HttpError(400, "WRONG_KIND_TICKET", "This is a ticket, not a concession code");
  }
  if (!hasValidSignature(qrToken)) {
    throw new HttpError(400, "INVALID_QR", "This is not a valid code");
  }
  const row = await findVoucher(qrToken);
  if (!row) {
    // A bare code that belongs to a ticket gets a clearer answer than "not found".
    const ticket = await prisma.ticket.findUnique({ where: { qrToken }, select: { id: true } });
    if (ticket) throw new HttpError(400, "WRONG_KIND_TICKET", "This is a ticket, not a concession code");
    throw new HttpError(404, "NOT_FOUND", "Item not found");
  }

  const usedAt = new Date();
  const collected = await prisma.concessionVoucher.updateMany({
    where: { id: row.id, status: "PAID" },
    data: { status: "USED", usedAt },
  });
  if (collected.count === 0) {
    const { status } = await prisma.concessionVoucher.findUniqueOrThrow({
      where: { id: row.id },
      select: { status: true },
    });
    throw status === "USED"
      ? new HttpError(409, "ALREADY_COLLECTED", "This item has already been collected")
      : new HttpError(409, "VOUCHER_CANCELLED", "This item was cancelled");
  }
  return present({ ...row, status: "USED", usedAt });
}

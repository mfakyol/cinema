import { prisma } from "../db.js";
import { HttpError } from "../lib/http-error.js";
import { listOrderVouchers } from "./concessions.js";

/** Hides most of the address on the public order page: "ja***@example.com". */
function maskEmail(email: string): string {
  const [name = "", domain = ""] = email.split("@");
  return `${name.slice(0, 2)}***@${domain}`;
}

/** The order behind an emailed link; the token itself is the only credential. */
export async function getOrderByAccessToken(accessToken: string) {
  const order = await prisma.order.findUnique({
    where: { accessToken },
    include: {
      tickets: {
        select: {
          id: true,
          qrToken: true,
          status: true,
          seat: { select: { row: true, number: true, type: true } },
          showtime: {
            select: {
              id: true,
              startsAt: true,
              movie: { select: { id: true, title: true, durationMin: true } },
              hall: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ seat: { row: "asc" } }, { seat: { number: "asc" } }],
      },
    },
  });
  if (!order || order.status !== "PAID") throw new HttpError(404, "NOT_FOUND", "Order not found");
  return {
    id: order.id,
    amount: order.amount,
    createdAt: order.createdAt,
    email: maskEmail(order.contactEmail),
    tickets: order.tickets,
    vouchers: await listOrderVouchers(order.id),
  };
}

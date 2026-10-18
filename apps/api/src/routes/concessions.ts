import { Router } from "express";
import QRCode from "qrcode";
import { concessionUrl, needsGlasses, scanSchema } from "@sinema/shared";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { HttpError } from "../lib/http-error.js";
import { hasValidSignature } from "../lib/qr.js";
import { validate } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { collectVoucher, getVoucherByQrToken } from "../services/concessions.js";

export const productsRouter = Router();

/**
 * Products on sale. With ?showtimeId, 3D glasses are listed only when that showtime needs them,
 * so clients show exactly what can be bought with it.
 */
productsRouter.get("/", async (req, res) => {
  const showtimeId = typeof req.query.showtimeId === "string" ? req.query.showtimeId : undefined;
  let withGlasses = true;
  if (showtimeId) {
    const showtime = await prisma.showtime.findUnique({ where: { id: showtimeId }, select: { format: true } });
    if (!showtime) throw new HttpError(404, "NOT_FOUND", "Showtime not found");
    withGlasses = needsGlasses(showtime.format);
  }
  const products = await prisma.product.findMany({
    where: { active: true, ...(withGlasses ? {} : { category: { not: "GLASSES" as const } }) },
    select: { id: true, name: true, description: true, category: true, price: true },
    orderBy: [{ sortOrder: "asc" }],
  });
  res.json({ products });
});

export const concessionsRouter = Router();

/** The stand hands an item over; staff and admins only. */
concessionsRouter.post("/collect", requireAuth("STAFF", "ADMIN"), async (req, res) => {
  const { qrToken } = validate(scanSchema, req.body);
  res.json({ voucher: await collectVoucher(qrToken) });
});

concessionsRouter.get("/:qrToken", async (req, res) => {
  res.json({ voucher: await getVoucherByQrToken(req.params.qrToken) });
});

/** The QR code as an image, for emails. It holds the link to the item. */
concessionsRouter.get("/:qrToken/qr.png", async (req, res) => {
  const { qrToken } = req.params;
  if (!hasValidSignature(qrToken)) throw new HttpError(404, "NOT_FOUND", "Item not found");
  const png = await QRCode.toBuffer(concessionUrl(env.WEB_URL, qrToken), { width: 360, margin: 2 });
  res.type("png").set("Cache-Control", "private, max-age=86400").send(png);
});

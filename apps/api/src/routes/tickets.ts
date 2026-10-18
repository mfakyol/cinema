import { Router } from "express";
import QRCode from "qrcode";
import { scanSchema, ticketUrl } from "@sinema/shared";
import { env } from "../env.js";
import { HttpError } from "../lib/http-error.js";
import { hasValidSignature } from "../lib/qr.js";
import { validate } from "../lib/validate.js";
import { caller, requireAuth } from "../middleware/auth.js";
import { listHolderVouchers } from "../services/concessions.js";
import { getTicketByQrToken, listHolderTickets, verifyTicket } from "../services/tickets.js";

export const meRouter = Router();

meRouter.get("/tickets", requireAuth(), async (req, res) => {
  res.json({ tickets: await listHolderTickets(caller(req).sub) });
});

meRouter.get("/concessions", requireAuth(), async (req, res) => {
  res.json({ vouchers: await listHolderVouchers(caller(req).sub) });
});

export const ticketsRouter = Router();

ticketsRouter.post("/verify", requireAuth("STAFF", "ADMIN"), async (req, res) => {
  const { qrToken } = validate(scanSchema, req.body);
  res.json({ ticket: await verifyTicket(qrToken) });
});

ticketsRouter.get("/:qrToken", async (req, res) => {
  res.json({ ticket: await getTicketByQrToken(req.params.qrToken) });
});

/** The QR code as an image, for emails, which cannot draw it themselves. It holds the ticket link. */
ticketsRouter.get("/:qrToken/qr.png", async (req, res) => {
  const { qrToken } = req.params;
  if (!hasValidSignature(qrToken)) throw new HttpError(404, "NOT_FOUND", "Ticket not found");
  const png = await QRCode.toBuffer(ticketUrl(env.WEB_URL, qrToken), { width: 360, margin: 2 });
  res.type("png").set("Cache-Control", "private, max-age=86400").send(png);
});

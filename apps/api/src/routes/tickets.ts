import { Router } from "express";
import { verifyTicketSchema } from "@sinema/shared";
import { validate } from "../lib/validate.js";
import { caller, requireAuth } from "../middleware/auth.js";
import { listHolderTickets, verifyTicket } from "../services/tickets.js";

export const meRouter = Router();

meRouter.get("/tickets", requireAuth(), async (req, res) => {
  res.json({ tickets: await listHolderTickets(caller(req).sub) });
});

export const ticketsRouter = Router();

ticketsRouter.post("/verify", requireAuth("STAFF", "ADMIN"), async (req, res) => {
  const { qrToken } = validate(verifyTicketSchema, req.body);
  res.json({ ticket: await verifyTicket(qrToken) });
});

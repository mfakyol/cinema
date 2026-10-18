import { Router } from "express";
import { lockSeatsSchema } from "@sinema/shared";
import { validate } from "../lib/validate.js";
import { caller, requireAuth } from "../middleware/auth.js";
import { lockSeats } from "../services/locks.js";
import { getSeatMap } from "../services/seats.js";

export const showtimesRouter = Router();

showtimesRouter.get("/:id/seats", async (req, res) => {
  res.json(await getSeatMap(req.params.id, req.auth?.sub));
});

showtimesRouter.post("/:id/locks", requireAuth("CUSTOMER", "GUEST"), async (req, res) => {
  const { seatIds } = validate(lockSeatsSchema, req.body);
  const locks = await lockSeats(caller(req).sub, String(req.params.id), seatIds);
  res.status(201).json({ locks });
});

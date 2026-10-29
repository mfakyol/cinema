import { Router } from "express";
import { lockSeatsSchema, showtimeRangeSchema } from "@sinema/shared";
import { validate } from "../lib/validate.js";
import { caller, requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { lockSeats } from "../services/locks.js";
import { getSeatMap } from "../services/seats.js";
import { listShowtimes } from "../services/showtime-lists.js";

export const showtimesRouter = Router();

/**
 * Every movie's showtimes between `from` and `to` that have not started yet, with how many
 * seats are neither sold nor held, so the box office can see full showings at a glance.
 */
showtimesRouter.get("/", async (req, res) => {
  const { from, to } = validate(showtimeRangeSchema, req.query);
  res.json({ showtimes: await listShowtimes(from, to) });
});

showtimesRouter.get("/:id/seats", async (req, res) => {
  res.json(await getSeatMap(req.params.id, req.auth?.sub));
});

showtimesRouter.post(
  "/:id/locks",
  requireAuth("CUSTOMER", "GUEST", "STAFF", "ADMIN"),
  rateLimit({ name: "locks", limit: 60, windowSeconds: 60 }),
  async (req, res) => {
    const { seatIds } = validate(lockSeatsSchema, req.body);
    const locks = await lockSeats(caller(req).sub, String(req.params.id), seatIds);
    res.status(201).json({ locks });
  },
);

import { Router } from "express";
import { lockSeatsSchema, seatPricing, showtimeRangeSchema } from "@sinema/shared";
import { prisma } from "../db.js";
import { validate } from "../lib/validate.js";
import { caller, requireAuth } from "../middleware/auth.js";
import { lockSeats } from "../services/locks.js";
import { getSeatMap } from "../services/seats.js";

export const showtimesRouter = Router();

/** Every movie's showtimes between `from` and `to` that have not started yet. */
showtimesRouter.get("/", async (req, res) => {
  const { from, to } = validate(showtimeRangeSchema, req.query);
  const now = new Date();
  const showtimes = await prisma.showtime.findMany({
    where: { startsAt: { gte: from > now ? from : now, lt: to } },
    include: {
      hall: { select: { id: true, name: true } },
      movie: { select: { id: true, title: true, durationMin: true, genre: true, posterUrl: true } },
    },
    orderBy: [{ startsAt: "asc" }, { hall: { name: "asc" } }],
  });
  res.json({
    showtimes: showtimes.map(({ id, startsAt, price, format, hall, movie }) => ({
      id,
      startsAt,
      format,
      hall,
      movie,
      ...seatPricing({ price, startsAt }),
    })),
  });
});

showtimesRouter.get("/:id/seats", async (req, res) => {
  res.json(await getSeatMap(req.params.id, req.auth?.sub));
});

showtimesRouter.post("/:id/locks", requireAuth("CUSTOMER", "GUEST", "STAFF", "ADMIN"), async (req, res) => {
  const { seatIds } = validate(lockSeatsSchema, req.body);
  const locks = await lockSeats(caller(req).sub, String(req.params.id), seatIds);
  res.status(201).json({ locks });
});

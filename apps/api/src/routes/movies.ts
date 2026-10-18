import { Router } from "express";
import { prisma } from "../db.js";
import { HttpError } from "../lib/http-error.js";

export const moviesRouter = Router();

moviesRouter.get("/", async (_req, res) => {
  const movies = await prisma.movie.findMany({ orderBy: { title: "asc" } });
  res.json({ movies });
});

moviesRouter.get("/:id", async (req, res) => {
  const movie = await prisma.movie.findUnique({ where: { id: req.params.id } });
  if (!movie) throw new HttpError(404, "NOT_FOUND", "Movie not found");
  res.json({ movie });
});

moviesRouter.get("/:id/showtimes", async (req, res) => {
  const movie = await prisma.movie.findUnique({ where: { id: req.params.id } });
  if (!movie) throw new HttpError(404, "NOT_FOUND", "Movie not found");
  const showtimes = await prisma.showtime.findMany({
    where: { movieId: movie.id, startsAt: { gt: new Date() } },
    include: { hall: { select: { id: true, name: true } } },
    orderBy: { startsAt: "asc" },
  });
  res.json({
    showtimes: showtimes.map(({ id, startsAt, price, hall }) => ({ id, startsAt, price, hall })),
  });
});

import { Router } from "express";
import { prisma } from "../db.js";
import { HttpError } from "../lib/http-error.js";
import { listMovieShowtimes } from "../services/showtime-lists.js";

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
  res.json({ showtimes: await listMovieShowtimes(movie.id) });
});

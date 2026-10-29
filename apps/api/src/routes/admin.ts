import { Router } from "express";
import {
  hallCreateSchema,
  hallLayoutSchema,
  hallUpdateSchema,
  layoutSchema,
  movieSchema,
  reasonSchema,
  showtimeBulkSchema,
  showtimeCreateSchema,
  showtimeRangeSchema,
} from "@sinema/shared";
import { validate } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";
import {
  createHall,
  createLayout,
  deleteLayout,
  getLayout,
  listHalls,
  listLayouts,
  setHallLayout,
  updateHall,
  updateLayout,
} from "../services/admin-halls.js";
import {
  cancelShowtime,
  createMovie,
  createShowtime,
  createShowtimesInBulk,
  listAdminShowtimes,
  listMovies,
  searchOrders,
  updateMovie,
} from "../services/admin-schedule.js";
import { refundOrder } from "../services/refunds.js";

/** The admin panel's API; every route is for admins only. */
export const adminRouter = Router();
adminRouter.use(requireAuth("ADMIN"));

adminRouter.get("/layouts", async (_req, res) => {
  res.json({ layouts: await listLayouts() });
});

adminRouter.get("/layouts/:id", async (req, res) => {
  res.json({ layout: await getLayout(req.params.id) });
});

adminRouter.post("/layouts", async (req, res) => {
  res.status(201).json({ layout: await createLayout(validate(layoutSchema, req.body)) });
});

adminRouter.put("/layouts/:id", async (req, res) => {
  res.json({ layout: await updateLayout(req.params.id, validate(layoutSchema, req.body)) });
});

adminRouter.delete("/layouts/:id", async (req, res) => {
  await deleteLayout(req.params.id);
  res.status(204).end();
});

adminRouter.get("/halls", async (_req, res) => {
  res.json({ halls: await listHalls() });
});

adminRouter.post("/halls", async (req, res) => {
  res.status(201).json({ hall: await createHall(validate(hallCreateSchema, req.body)) });
});

adminRouter.patch("/halls/:id", async (req, res) => {
  res.json({ hall: await updateHall(req.params.id, validate(hallUpdateSchema, req.body)) });
});

adminRouter.put("/halls/:id/layout", async (req, res) => {
  const { layoutId } = validate(hallLayoutSchema, req.body);
  res.json({ hall: await setHallLayout(req.params.id, layoutId) });
});

adminRouter.get("/movies", async (_req, res) => {
  res.json({ movies: await listMovies() });
});

adminRouter.post("/movies", async (req, res) => {
  res.status(201).json({ movie: await createMovie(validate(movieSchema, req.body)) });
});

adminRouter.put("/movies/:id", async (req, res) => {
  res.json({ movie: await updateMovie(req.params.id, validate(movieSchema, req.body)) });
});

adminRouter.get("/showtimes", async (req, res) => {
  const { from, to } = validate(showtimeRangeSchema, req.query);
  res.json({ showtimes: await listAdminShowtimes(from, to) });
});

adminRouter.post("/showtimes", async (req, res) => {
  res.status(201).json({ showtime: await createShowtime(validate(showtimeCreateSchema, req.body)) });
});

adminRouter.post("/showtimes/bulk", async (req, res) => {
  res.status(201).json(await createShowtimesInBulk(validate(showtimeBulkSchema, req.body)));
});

/** Cancels a showtime and refunds every paid order for it. */
adminRouter.post("/showtimes/:id/cancel", async (req, res) => {
  const { reason } = validate(reasonSchema, req.body);
  res.json(await cancelShowtime(req.params.id, reason));
});

adminRouter.get("/orders", async (req, res) => {
  res.json({ orders: await searchOrders(typeof req.query.q === "string" ? req.query.q : undefined) });
});

adminRouter.post("/orders/:id/refund", async (req, res) => {
  const { reason } = validate(reasonSchema, req.body);
  await refundOrder(req.params.id, reason);
  res.status(204).end();
});


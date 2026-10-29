import { Router } from "express";
import { hallCreateSchema, hallLayoutSchema, hallUpdateSchema, layoutSchema } from "@sinema/shared";
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

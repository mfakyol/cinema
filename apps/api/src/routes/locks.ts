import { Router } from "express";
import { caller, requireAuth } from "../middleware/auth.js";
import { releaseLock } from "../services/locks.js";

export const locksRouter = Router();

locksRouter.delete("/:id", requireAuth(), async (req, res) => {
  await releaseLock(caller(req).sub, String(req.params.id));
  res.status(204).end();
});

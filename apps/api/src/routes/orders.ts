import { Router } from "express";
import { getOrderByAccessToken } from "../services/orders.js";

export const ordersRouter = Router();

ordersRouter.get("/:accessToken", async (req, res) => {
  res.json({ order: await getOrderByAccessToken(req.params.accessToken) });
});

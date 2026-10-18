import { Router } from "express";
import { checkoutSchema } from "@sinema/shared";
import { validate } from "../lib/validate.js";
import { caller, requireAuth } from "../middleware/auth.js";
import { checkout } from "../services/checkout.js";

export const checkoutRouter = Router();

checkoutRouter.post("/", requireAuth("CUSTOMER", "GUEST"), async (req, res) => {
  const order = await checkout(caller(req), validate(checkoutSchema, req.body));
  res.status(201).json({ order });
});

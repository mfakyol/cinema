import { Router } from "express";
import { checkoutSchema, kioskCheckoutSchema } from "@sinema/shared";
import { validate } from "../lib/validate.js";
import { caller, requireAuth } from "../middleware/auth.js";
import { checkout, kioskCheckout } from "../services/checkout.js";

export const checkoutRouter = Router();

checkoutRouter.post("/", requireAuth("CUSTOMER", "GUEST"), async (req, res) => {
  const order = await checkout(caller(req), validate(checkoutSchema, req.body));
  res.status(201).json({ order });
});

/** Box-office sales: staff sell to walk-in customers who pay at the counter. */
checkoutRouter.post("/kiosk", requireAuth("STAFF", "ADMIN"), async (req, res) => {
  const order = await kioskCheckout(caller(req), validate(kioskCheckoutSchema, req.body));
  res.status(201).json({ order });
});

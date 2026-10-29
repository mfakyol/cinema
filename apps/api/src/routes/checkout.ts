import { Router } from "express";
import { checkoutSchema, kioskCheckoutSchema } from "@sinema/shared";
import { validate } from "../lib/validate.js";
import { caller, requireAuth } from "../middleware/auth.js";
import { idempotent } from "../middleware/idempotency.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { checkout, getHolderOrder, kioskCheckout } from "../services/checkout.js";

export const checkoutRouter = Router();

const checkoutLimit = rateLimit({ name: "checkout", limit: 10, windowSeconds: 60 });

/** Starts a card payment: 202 with the PENDING order; the provider's webhook settles it. */
checkoutRouter.post("/", requireAuth("CUSTOMER", "GUEST"), checkoutLimit, idempotent(), async (req, res) => {
  const { status, order } = await checkout(caller(req), validate(checkoutSchema, req.body));
  res.status(status).json({ order });
});

/** Box-office sales: cash settles at once (201); card goes through the provider like online (202). */
checkoutRouter.post("/kiosk", requireAuth("STAFF", "ADMIN"), checkoutLimit, idempotent(), async (req, res) => {
  const { status, order } = await kioskCheckout(caller(req), validate(kioskCheckoutSchema, req.body));
  res.status(status).json({ order });
});

/** The holder follows their order until the payment settles it as PAID or FAILED. */
checkoutRouter.get("/orders/:id", requireAuth(), async (req, res) => {
  res.json({ order: await getHolderOrder(caller(req).sub, String(req.params.id)) });
});

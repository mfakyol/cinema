import { Router } from "express";
import { HttpError } from "../lib/http-error.js";
import { FAKE_SIGNATURE_HEADER } from "../payments/fake-provider.js";
import { paymentProvider } from "../payments/index.js";
import { settleOrder } from "../services/settlement.js";

export const webhooksRouter = Router();

/**
 * Payment outcomes from the provider. The signature is checked over the raw body. Each event is
 * recorded in processed_webhooks in the same transaction as the order update, so a redelivery
 * is acknowledged without doing anything again. Any 2xx tells the provider to stop retrying.
 */
webhooksRouter.post("/payments/:provider", async (req, res) => {
  if (req.params.provider !== paymentProvider.name) throw new HttpError(404, "NOT_FOUND", "Unknown provider");
  const event = paymentProvider.parseWebhook(req.rawBody ?? Buffer.alloc(0), req.get(FAKE_SIGNATURE_HEADER));
  const result = await settleOrder(
    event.orderId,
    event.type === "payment.succeeded" ? { paid: true, providerRef: event.providerRef } : { paid: false, reason: event.reason },
    { provider: paymentProvider.name, eventId: event.id, type: event.type },
  );
  res.json({ received: true, result });
});

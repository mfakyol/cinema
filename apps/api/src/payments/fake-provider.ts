import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";
import { HttpError } from "../lib/http-error.js";
import type { ChargeAccepted, ChargeRequest, PaymentEvent, PaymentProvider } from "./provider.js";

export const FAKE_SIGNATURE_HEADER = "x-fake-signature";

/** HMAC-SHA256 of the raw body with the shared webhook secret, hex. */
export function signFakeWebhook(rawBody: string | Buffer): string {
  return createHmac("sha256", env.PAYMENT_WEBHOOK_SECRET).update(rawBody).digest("hex");
}

/** A webhook body as the fake provider sends it. */
export function fakePaymentEvent(event: Omit<PaymentEvent, "id"> & { id?: string }): PaymentEvent {
  return { ...event, id: event.id ?? `evt_${randomUUID()}` };
}

/**
 * Behaves like a card gateway: a charge is only accepted at first, and the result is sent later
 * to our webhook, signed, the way real providers do. Like them it retries a delivery that
 * fails, so the webhook may see an event more than once. Declines when asked to.
 */
export class FakeProvider implements PaymentProvider {
  readonly name = "fake";

  async charge(request: ChargeRequest): Promise<ChargeAccepted> {
    const providerRef = `fake_${randomUUID()}`;
    const event = fakePaymentEvent(
      request.simulate === "decline"
        ? { type: "payment.failed", orderId: request.orderId, providerRef, reason: "Card declined" }
        : { type: "payment.succeeded", orderId: request.orderId, providerRef },
    );
    if (env.FAKE_PAYMENT_CALLBACKS === "on") {
      setTimeout(() => void this.deliver(event), env.FAKE_PAYMENT_DELAY_MS).unref();
    }
    return { providerRef };
  }

  async refund(providerRef: string): Promise<void> {
    console.log(`fake payments: refunded ${providerRef}`);
  }

  parseWebhook(rawBody: Buffer, signature: string | undefined): PaymentEvent {
    const expected = Buffer.from(signFakeWebhook(rawBody), "hex");
    const given = Buffer.from(signature ?? "", "hex");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new HttpError(401, "INVALID_SIGNATURE", "Webhook signature does not match");
    }
    return JSON.parse(rawBody.toString("utf8")) as PaymentEvent;
  }

  private async deliver(event: PaymentEvent, attempt = 1): Promise<void> {
    const body = JSON.stringify(event);
    try {
      const response = await fetch(`${env.API_URL}/api/webhooks/payments/${this.name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", [FAKE_SIGNATURE_HEADER]: signFakeWebhook(body) },
        body,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (attempt >= 5) {
        console.error(`fake payments: giving up on ${event.id}`, error);
        return;
      }
      setTimeout(() => void this.deliver(event, attempt + 1), 1000 * 2 ** attempt).unref();
    }
  }
}

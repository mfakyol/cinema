import { randomUUID } from "node:crypto";
import type { ChargeRequest, ChargeResult, PaymentProvider } from "./provider.js";

/** Approves every charge unless asked to decline. Used until a real provider is wired in. */
export class FakeProvider implements PaymentProvider {
  readonly name = "fake";

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    if (request.simulate === "decline") return { ok: false, reason: "Card declined" };
    return { ok: true, providerRef: `fake_${randomUUID()}` };
  }

  async refund(): Promise<void> {}
}

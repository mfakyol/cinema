export interface ChargeRequest {
  /** Our order id, sent to the provider as its reference. */
  orderId: string;
  /** Amount in cents. */
  amount: number;
  simulate?: "success" | "decline";
}

export type ChargeResult = { ok: true; providerRef: string } | { ok: false; reason: string };

/** Payment gateway boundary; a real provider (iyzico, Stripe) implements the same shape. */
export interface PaymentProvider {
  readonly name: string;
  charge(request: ChargeRequest): Promise<ChargeResult>;
  refund(providerRef: string): Promise<void>;
}

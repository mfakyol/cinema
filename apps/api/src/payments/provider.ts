export interface ChargeRequest {
  /** Our order id, sent to the provider as its reference. */
  orderId: string;
  /** Amount in cents. */
  amount: number;
  simulate?: "success" | "decline";
}

/** The provider took the charge for processing; the outcome arrives later as a webhook event. */
export interface ChargeAccepted {
  providerRef: string;
}

/** A provider's webhook event, already authenticated and parsed. */
export interface PaymentEvent {
  /** The provider's event id; the same event may be delivered more than once. */
  id: string;
  type: "payment.succeeded" | "payment.failed";
  orderId: string;
  providerRef: string;
  reason?: string;
}

/** Payment gateway boundary; a real provider (iyzico, Stripe) implements the same shape. */
export interface PaymentProvider {
  readonly name: string;
  charge(request: ChargeRequest): Promise<ChargeAccepted>;
  refund(providerRef: string): Promise<void>;
  /** Checks a webhook's signature and parses it; throws if it is not genuine. */
  parseWebhook(rawBody: Buffer, signature: string | undefined): PaymentEvent;
}

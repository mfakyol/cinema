import { FakeProvider } from "./fake-provider.js";
import type { PaymentProvider } from "./provider.js";

export const paymentProvider: PaymentProvider = new FakeProvider();

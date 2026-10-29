import { z } from "zod";

/**
 * Card numbers the fake payment provider knows, like a real provider's test mode: one is
 * approved, one is declined. Any other valid number is approved too.
 */
export const TEST_CARDS = {
  approved: { holder: "Test Customer", number: "4242424242424242", expiry: "12/30", cvc: "123" },
  declined: { holder: "Test Customer", number: "4000000000000002", expiry: "12/30", cvc: "123" },
} as const;

/** The Luhn checksum every real card number passes. */
export function passesLuhn(number: string): boolean {
  let sum = 0;
  for (let i = 0; i < number.length; i++) {
    let digit = Number(number[number.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return number.length > 0 && sum % 10 === 0;
}

/** True when an "MM/YY" expiry is this month or later. */
export function notExpired(expiry: string, now = new Date()): boolean {
  const [month, year] = expiry.split("/").map(Number);
  if (!month || year === undefined) return false;
  const fullYear = 2000 + year;
  return fullYear > now.getFullYear() || (fullYear === now.getFullYear() && month >= now.getMonth() + 1);
}

/**
 * A card as typed on the payment step. It is passed straight to the payment provider and
 * never stored.
 */
export const cardSchema = z.object({
  holder: z.string().trim().min(2).max(100),
  /** Digits only; spaces are stripped by the form. */
  number: z.string().regex(/^\d{12,19}$/).refine(passesLuhn, "Invalid card number"),
  expiry: z
    .string()
    .regex(/^(0[1-9]|1[0-2])\/\d{2}$/)
    .refine((expiry) => notExpired(expiry), "Card has expired"),
  cvc: z.string().regex(/^\d{3,4}$/),
});
export type CardInput = z.infer<typeof cardSchema>;

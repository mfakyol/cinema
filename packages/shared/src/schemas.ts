import { z } from "zod";
import { MAX_ITEM_QUANTITY, MAX_LOCKS_PER_HOLDER } from "./constants.js";
import { LOCALES } from "./i18n.js";

export const registerSchema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(100),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const guestSessionSchema = z.object({
  /** The kiosk app asks for KIOSK; the website and mobile app for their own channel. */
  channel: z.enum(["WEB", "MOBILE", "KIOSK"]).default("KIOSK"),
});
export type GuestSessionInput = z.infer<typeof guestSessionSchema>;

export const lockSeatsSchema = z.object({
  seatIds: z.array(z.uuid()).min(1).max(MAX_LOCKS_PER_HOLDER),
});
export type LockSeatsInput = z.infer<typeof lockSeatsSchema>;

export const checkoutSchema = z.object({
  showtimeId: z.uuid(),
  /** Client-generated; repeating a checkout with the same key returns the same order. */
  idempotencyKey: z.string().min(8).max(100),
  /** Ignored for guests, whose channel comes from their guest session. */
  channel: z.enum(["WEB", "MOBILE"]).default("WEB"),
  /** The tickets and the order link are sent here; guests have no account to hold them. */
  email: z.email().toLowerCase(),
  /** Language of the confirmation email. */
  locale: z.enum(LOCALES).default("en"),
  /** Snacks, drinks and 3D glasses bought with the tickets; each unit gets its own QR code. */
  items: z
    .array(z.object({ productId: z.uuid(), quantity: z.number().int().min(1).max(MAX_ITEM_QUANTITY) }))
    .max(20)
    .default([]),
  /** Lets demos and tests trigger a declined payment with the fake provider. */
  simulate: z.enum(["success", "decline"]).default("success"),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** What a scanner read: the link from a QR code, or a bare code. */
export const scanSchema = z.object({
  qrToken: z.string().min(1).max(500),
});
export type ScanInput = z.infer<typeof scanSchema>;

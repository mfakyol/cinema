import { z } from "zod";
import { MAX_LOCKS_PER_HOLDER } from "./constants.js";

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

export const lockSeatsSchema = z.object({
  seatIds: z.array(z.uuid()).min(1).max(MAX_LOCKS_PER_HOLDER),
});
export type LockSeatsInput = z.infer<typeof lockSeatsSchema>;

export const checkoutSchema = z.object({
  showtimeId: z.uuid(),
  /** Client-generated; repeating a checkout with the same key returns the same order. */
  idempotencyKey: z.string().min(8).max(100),
  /** Ignored for kiosk guests, whose channel is always KIOSK. */
  channel: z.enum(["WEB", "MOBILE"]).default("WEB"),
  /** Lets demos and tests trigger a declined payment with the fake provider. */
  simulate: z.enum(["success", "decline"]).default("success"),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const verifyTicketSchema = z.object({
  qrToken: z.string().min(1).max(200),
});
export type VerifyTicketInput = z.infer<typeof verifyTicketSchema>;

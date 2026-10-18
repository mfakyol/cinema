import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000),
  JWT_SECRET: z.string().min(16),
  QR_SECRET: z.string().min(16),
  /** Public address of the website, used in order links sent by email. */
  WEB_URL: z.url().default("http://localhost:3000"),
  /** Public address of this API, used for QR code images in emails. */
  API_URL: z.url().default("http://localhost:4000"),
  /** EmailJS account; without all four, emails are written to the log instead of sent. */
  EMAILJS_SERVICE_ID: z.string().optional(),
  EMAILJS_TEMPLATE_ID: z.string().optional(),
  EMAILJS_PUBLIC_KEY: z.string().optional(),
  EMAILJS_PRIVATE_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);

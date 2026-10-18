import type { ZodType } from "zod";
import { HttpError } from "./http-error.js";

/** Parses input with a schema, turning failures into a 400 with the issues attached. */
export function validate<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new HttpError(400, "VALIDATION", "Invalid request", result.error.issues);
  }
  return result.data;
}

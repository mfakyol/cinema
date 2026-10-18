import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "./env.js";
import { Prisma, PrismaClient } from "./generated/prisma/client.js";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });

/** True when a write hit a unique constraint, e.g. two holders locking one seat. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

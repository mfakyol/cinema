import jwt from "jsonwebtoken";
import type { Role } from "@sinema/shared";
import { env } from "../env.js";

/** Kiosk customers get a short-lived guest identity instead of an account. */
export type AuthRole = Role | "GUEST";

export interface AuthClaims {
  /** User id, or a random id for a kiosk guest session. */
  sub: string;
  role: AuthRole;
}

const USER_TOKEN_TTL = "7d";
const GUEST_TOKEN_TTL = "2h";

export function signToken(claims: AuthClaims): string {
  return jwt.sign({ role: claims.role }, env.JWT_SECRET, {
    subject: claims.sub,
    expiresIn: claims.role === "GUEST" ? GUEST_TOKEN_TTL : USER_TOKEN_TTL,
  });
}

/** Returns the claims, or null when the token is missing, invalid or expired. */
export function verifyToken(token: string): AuthClaims | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (typeof payload === "string" || !payload.sub || typeof payload.role !== "string") {
      return null;
    }
    return { sub: payload.sub, role: payload.role as AuthRole };
  } catch {
    return null;
  }
}

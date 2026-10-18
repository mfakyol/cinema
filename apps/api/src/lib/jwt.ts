import jwt from "jsonwebtoken";
import type { Role, SalesChannel } from "@sinema/shared";
import { env } from "../env.js";

/** Customers who buy without an account get a guest identity instead. */
export type AuthRole = Role | "GUEST";

export interface AuthClaims {
  /** User id, or a random id for a guest session. */
  sub: string;
  role: AuthRole;
  /** Where a guest is buying from; signed-in users name it per checkout. */
  channel?: SalesChannel;
}

const USER_TOKEN_TTL = "7d";
/** A kiosk session belongs to whoever stands at the screen, so it ends quickly. */
const KIOSK_GUEST_TOKEN_TTL = "2h";
/** Web and mobile guests keep seeing their tickets on that device until after the show. */
const DEVICE_GUEST_TOKEN_TTL = "30d";

function ttlFor(claims: AuthClaims) {
  if (claims.role !== "GUEST") return USER_TOKEN_TTL;
  return claims.channel === "KIOSK" ? KIOSK_GUEST_TOKEN_TTL : DEVICE_GUEST_TOKEN_TTL;
}

export function signToken(claims: AuthClaims): string {
  return jwt.sign(
    { role: claims.role, ...(claims.channel ? { channel: claims.channel } : {}) },
    env.JWT_SECRET,
    { subject: claims.sub, expiresIn: ttlFor(claims) },
  );
}

/** Returns the claims, or null when the token is missing, invalid or expired. */
export function verifyToken(token: string): AuthClaims | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (typeof payload === "string" || !payload.sub || typeof payload.role !== "string") {
      return null;
    }
    return {
      sub: payload.sub,
      role: payload.role as AuthRole,
      ...(typeof payload.channel === "string" ? { channel: payload.channel as SalesChannel } : {}),
    };
  } catch {
    return null;
  }
}

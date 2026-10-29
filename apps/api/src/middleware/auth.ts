import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/http-error.js";
import { type AuthClaims, type AuthRole, verifyToken } from "../lib/jwt.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthClaims;
      /** The exact request body, for verifying webhook signatures. */
      rawBody?: Buffer;
    }
  }
}

/** Reads a Bearer token when present; routes decide whether it is required. */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const claims = verifyToken(header.slice("Bearer ".length));
    if (claims) req.auth = claims;
  }
  next();
}

/** Rejects requests without a valid token, or whose role is not in `roles` when given. */
export function requireAuth(...roles: AuthRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      throw new HttpError(401, "UNAUTHENTICATED", "Sign in required");
    }
    if (roles.length > 0 && !roles.includes(req.auth.role)) {
      throw new HttpError(403, "FORBIDDEN", "Not allowed for this role");
    }
    next();
  };
}

/** The authenticated caller; only call behind requireAuth. */
export function caller(req: Request): AuthClaims {
  if (!req.auth) throw new HttpError(401, "UNAUTHENTICATED", "Sign in required");
  return req.auth;
}

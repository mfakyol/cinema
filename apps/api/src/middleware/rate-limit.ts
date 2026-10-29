import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/http-error.js";
import { redis } from "../infra/redis.js";

/**
 * Fixed-window rate limit in Redis: one counter per caller (their user or guest id, else their
 * IP) per window, created with INCR and expiring with the window. Over the limit the request is
 * refused with 429 and Retry-After. Shared by every API instance, unlike an in-memory counter.
 */
export function rateLimit({ name, limit, windowSeconds }: { name: string; limit: number; windowSeconds: number }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const who = req.auth?.sub ?? req.ip ?? "unknown";
    const window = Math.floor(Date.now() / 1000 / windowSeconds);
    const key = `ratelimit:${name}:${who}:${window}`;
    const [[, count]] = (await redis.multi().incr(key).expire(key, windowSeconds, "NX").exec()) as [
      [Error | null, number],
      [Error | null, number],
    ];
    res.setHeader("RateLimit-Limit", limit);
    res.setHeader("RateLimit-Remaining", Math.max(0, limit - count));
    if (count > limit) {
      const retryAfter = windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds);
      res.setHeader("Retry-After", retryAfter);
      throw new HttpError(429, "RATE_LIMITED", "Too many requests; try again shortly");
    }
    next();
  };
}

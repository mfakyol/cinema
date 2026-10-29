import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db.js";
import { Prisma } from "../generated/prisma/client.js";
import { HttpError } from "../lib/http-error.js";
import { caller } from "./auth.js";

export const IDEMPOTENCY_HEADER = "Idempotency-Key";

/**
 * Makes a POST safe to retry with the same Idempotency-Key header (8–100 characters).
 *
 * - First time: a row is inserted into idempotency_keys (primary key: caller + key) as
 *   IN_PROGRESS, the handler runs, and its response is stored with the row as COMPLETED.
 * - Repeat after that: the stored response is sent again, marked Idempotent-Replayed.
 * - Repeat while the first is still running: 409 REQUEST_IN_PROGRESS.
 * - Same key, different request: 422 IDEMPOTENCY_KEY_REUSED.
 *
 * A server error (5xx) deletes the row, so the client can retry the same key once things work
 * again; a 4xx answer is final and replayed like a success.
 */
export function idempotent() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = req.get(IDEMPOTENCY_HEADER);
    if (!key || key.length < 8 || key.length > 100) {
      throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", `Send an ${IDEMPOTENCY_HEADER} header (8–100 characters)`);
    }
    const holderId = caller(req).sub;
    const requestHash = createHash("sha256")
      .update(`${req.method} ${req.baseUrl}${req.path}\n${JSON.stringify(req.body ?? null)}`)
      .digest("hex");

    const inserted = await prisma.$executeRaw`
      INSERT INTO idempotency_keys (holder_id, key, request_hash)
      VALUES (${holderId}, ${key}, ${requestHash})
      ON CONFLICT DO NOTHING`;

    if (inserted === 0) {
      const existing = await prisma.idempotencyKey.findUnique({ where: { holderId_key: { holderId, key } } });
      if (!existing) throw new HttpError(409, "REQUEST_IN_PROGRESS", "Retry this request in a moment");
      if (existing.requestHash !== requestHash) {
        throw new HttpError(422, "IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was used for a different request");
      }
      if (existing.status === "IN_PROGRESS") {
        throw new HttpError(409, "REQUEST_IN_PROGRESS", "The first request with this key is still running");
      }
      res.setHeader("Idempotent-Replayed", "true");
      res.status(existing.responseStatus ?? 200).json(existing.responseBody);
      return;
    }

    // Store whatever the handler (or the error handler) answers before it goes out.
    const send = res.json.bind(res);
    res.json = (body: unknown) => {
      const status = res.statusCode;
      const where = { holderId_key: { holderId, key } };
      const saved =
        status >= 500
          ? prisma.idempotencyKey.delete({ where })
          : prisma.idempotencyKey.update({
              where,
              data: { status: "COMPLETED", responseStatus: status, responseBody: (body ?? Prisma.JsonNull) as Prisma.InputJsonValue },
            });
      saved
        .catch((error: unknown) => console.error("Saving the idempotent response failed", error))
        .finally(() => send(body));
      return res;
    };
    next();
  };
}

import express, { type ErrorRequestHandler } from "express";
import { prisma } from "./db.js";
import { HttpError } from "./lib/http-error.js";
import { authenticate } from "./middleware/auth.js";
import { authRouter } from "./routes/auth.js";
import { checkoutRouter } from "./routes/checkout.js";
import { locksRouter } from "./routes/locks.js";
import { moviesRouter } from "./routes/movies.js";
import { showtimesRouter } from "./routes/showtimes.js";
import { meRouter, ticketsRouter } from "./routes/tickets.js";

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }
  // Malformed JSON bodies come from express.json().
  if (error?.type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "INVALID_JSON", message: "Request body is not valid JSON" } });
    return;
  }
  console.error(error);
  res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong" } });
};

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(authenticate);

  const api = express.Router();
  api.get("/health", async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  });
  api.use("/auth", authRouter);
  api.use("/movies", moviesRouter);
  api.use("/showtimes", showtimesRouter);
  api.use("/locks", locksRouter);
  api.use("/checkout", checkoutRouter);
  api.use("/me", meRouter);
  api.use("/tickets", ticketsRouter);
  api.use((_req, _res) => {
    throw new HttpError(404, "NOT_FOUND", "Route not found");
  });

  app.use("/api", api);
  app.use(errorHandler);
  return app;
}

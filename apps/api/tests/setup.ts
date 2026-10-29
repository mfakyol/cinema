import { afterAll, beforeEach } from "vitest";
import { prisma } from "../src/db.js";
import { closeRedis, redis } from "../src/infra/redis.js";

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "ConcessionVoucher", "OrderItem", "Product", "Ticket", "Order", "Showtime", "Seat", "Hall", "HallLayout", "Movie", "User", ' +
      "idempotency_keys, processed_webhooks, processed_messages, outbox, print_jobs, daily_sales CASCADE",
  );
  // Holds, caches and rate limits live in Redis database 1 during tests.
  await redis.flushdb();
});

afterAll(async () => {
  await prisma.$disconnect();
  await closeRedis();
});

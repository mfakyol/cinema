-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PrintJobStatus" AS ENUM ('QUEUED', 'PRINTED');

-- Seat holds move to Redis.
ALTER TABLE "SeatLock" DROP CONSTRAINT "SeatLock_seatId_fkey";
ALTER TABLE "SeatLock" DROP CONSTRAINT "SeatLock_showtimeId_fkey";
DROP TABLE "SeatLock";

-- Idempotency keys move to their own table.
DROP INDEX "Order_idempotencyKey_key";
ALTER TABLE "Order" DROP COLUMN "idempotencyKey";

-- A pending order carries what to issue when the payment is confirmed.
ALTER TABLE "Order"
ADD COLUMN "showtimeId" TEXT,
ADD COLUMN "seatIds" TEXT[],
ADD COLUMN "seatPrice" INTEGER,
ADD COLUMN "channel" "SalesChannel",
ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en';

-- Orders from before this change: take the showtime, seats and channel from their tickets, and
-- the seat price from the amount less the items.
UPDATE "Order" o
SET "showtimeId" = t."showtimeId",
    "seatIds" = t."seatIds",
    "channel" = t."channel",
    "seatPrice" = (o."amount" - COALESCE(i."itemsTotal", 0)) / t."count"
FROM (
  SELECT "orderId", MIN("showtimeId") AS "showtimeId", ARRAY_AGG("seatId") AS "seatIds",
         MIN("channel"::TEXT)::"SalesChannel" AS "channel", COUNT(*) AS "count"
  FROM "Ticket" GROUP BY "orderId"
) t
LEFT JOIN (
  SELECT "orderId", SUM("quantity" * "unitPrice") AS "itemsTotal" FROM "OrderItem" GROUP BY "orderId"
) i ON i."orderId" = t."orderId"
WHERE t."orderId" = o."id";

-- Old attempts that never produced tickets (declined or abandoned) carry nothing to keep.
DELETE FROM "OrderItem" WHERE "orderId" IN (SELECT "id" FROM "Order" WHERE "showtimeId" IS NULL);
DELETE FROM "Order" WHERE "showtimeId" IS NULL;

ALTER TABLE "Order"
ALTER COLUMN "showtimeId" SET NOT NULL,
ALTER COLUMN "seatPrice" SET NOT NULL,
ALTER COLUMN "channel" SET NOT NULL;

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "holder_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("holder_id","key")
);

-- CreateTable
CREATE TABLE "processed_webhooks" (
    "provider" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "processed_webhooks_pkey" PRIMARY KEY ("provider","event_id")
);

-- CreateTable
CREATE TABLE "processed_messages" (
    "consumer" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "processed_messages_pkey" PRIMARY KEY ("consumer","message_id")
);

-- CreateTable
CREATE TABLE "outbox" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- The relay only ever looks for unpublished rows, oldest first; the index stays as small as the
-- backlog. Prisma cannot express a partial index, so it is added here by hand.
CREATE INDEX "outbox_unpublished_idx" ON "outbox"("created_at") WHERE "published_at" IS NULL;

-- CreateTable
CREATE TABLE "print_jobs" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "status" "PrintJobStatus" NOT NULL DEFAULT 'QUEUED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "printed_at" TIMESTAMP(3),
    CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_sales" (
    "day" DATE NOT NULL,
    "channel" "SalesChannel" NOT NULL,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "tickets" INTEGER NOT NULL DEFAULT 0,
    "items" INTEGER NOT NULL DEFAULT 0,
    "revenue" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "daily_sales_pkey" PRIMARY KEY ("day","channel")
);

-- CreateIndex
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "print_jobs_ticket_id_key" ON "print_jobs"("ticket_id");

-- CreateIndex
CREATE INDEX "Order_holderId_idx" ON "Order"("holderId");

-- CreateIndex
CREATE INDEX "Showtime_startsAt_idx" ON "Showtime"("startsAt");

-- CreateIndex
CREATE INDEX "Showtime_movieId_startsAt_idx" ON "Showtime"("movieId", "startsAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_showtimeId_fkey" FOREIGN KEY ("showtimeId") REFERENCES "Showtime"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

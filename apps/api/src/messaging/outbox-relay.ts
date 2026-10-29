import type { ConfirmChannel } from "amqplib";
import { prisma } from "../db.js";
import { EVENTS_EXCHANGE } from "./topology.js";

export interface OutboxRow {
  id: string;
  type: string;
  payload: unknown;
  created_at: Date;
}

/** Sends a batch and resolves once the broker has confirmed every message in it. */
export type Publish = (rows: OutboxRow[]) => Promise<void>;

const BATCH_SIZE = 50;

/**
 * Publishes one batch of unpublished outbox rows, oldest first, and marks them published.
 *
 * The rows are locked FOR UPDATE SKIP LOCKED for the whole step, so several relays can run and
 * never send the same row at once. They are marked only after the broker confirms them; if the
 * publish or the commit fails, they stay unpublished and go again on the next pass. Delivery is
 * therefore at least once, and consumers drop repeats by message id (the outbox row id).
 *
 * Returns how many rows were sent.
 */
export async function relayOnce(publish: Publish): Promise<number> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<OutboxRow[]>`
        SELECT id, type, payload, created_at FROM outbox
        WHERE published_at IS NULL
        ORDER BY created_at
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED`;
      if (rows.length === 0) return 0;
      try {
        await publish(rows);
      } catch (error) {
        // Keep the rows for the next pass, but note why this one failed.
        await tx.$executeRaw`
          UPDATE outbox SET attempts = attempts + 1, last_error = ${String(error)}
          WHERE id = ANY(${rows.map((row) => row.id)})`;
        return 0;
      }
      await tx.$executeRaw`UPDATE outbox SET published_at = now() WHERE id = ANY(${rows.map((row) => row.id)})`;
      return rows.length;
    },
    { timeout: 30_000 },
  );
}

/** Publishes rows to the events exchange with publisher confirms; persistent, id = message id. */
export function publisherFor(channel: ConfirmChannel): Publish {
  return async (rows) => {
    for (const row of rows) {
      channel.publish(EVENTS_EXCHANGE, row.type, Buffer.from(JSON.stringify(row.payload)), {
        messageId: row.id,
        type: row.type,
        contentType: "application/json",
        persistent: true,
        timestamp: Math.floor(row.created_at.getTime() / 1000),
      });
    }
    await channel.waitForConfirms();
  };
}

/** Polls the outbox until stopped; a full batch is followed by another pass straight away. */
export function startRelay(publish: Publish, intervalMs = 500): { stop: () => Promise<void> } {
  let running = true;
  let current: Promise<void> = Promise.resolve();
  const loop = async () => {
    while (running) {
      let sent = 0;
      try {
        sent = await relayOnce(publish);
      } catch (error) {
        console.error("Outbox relay pass failed", error);
      }
      if (sent < BATCH_SIZE) await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  };
  current = loop();
  return {
    stop: async () => {
      running = false;
      await current;
    },
  };
}

import type { Channel } from "amqplib";
import { TICKET_ISSUED } from "./events.js";

/** All events go through one topic exchange; the routing key is the event type. */
export const EVENTS_EXCHANGE = "sinema.events";

/** Delay before a failed message is tried again, and how many tries it gets before the DLQ. */
export const RETRY_DELAY_MS = 5_000;
export const MAX_ATTEMPTS = 5;

/** Each consumer has its own queue, so one slow or failing worker never holds up the others. */
export const QUEUES = {
  email: "ticket-issued.email",
  kioskPrint: "ticket-issued.kiosk-print",
  salesStats: "ticket-issued.sales-stats",
} as const;

export const retryQueue = (queue: string) => `${queue}.retry`;
export const deadLetterQueue = (queue: string) => `${queue}.dlq`;

/**
 * Declares the exchange and, per consumer queue:
 *   <queue>        bound to ticket.issued, where the worker consumes;
 *   <queue>.retry  no consumer; a message waits RETRY_DELAY_MS, then dead-letters back to <queue>;
 *   <queue>.dlq    where a message lands after MAX_ATTEMPTS failures, for a person to look at.
 * Declaring is idempotent, so every process does it on start.
 */
export async function assertTopology(channel: Channel): Promise<void> {
  await channel.assertExchange(EVENTS_EXCHANGE, "topic", { durable: true });
  for (const queue of Object.values(QUEUES)) {
    await assertQueueWithRetry(channel, queue);
    await channel.bindQueue(queue, EVENTS_EXCHANGE, TICKET_ISSUED);
  }
}

/** A consumer queue with its retry and dead-letter queues. */
export async function assertQueueWithRetry(
  channel: Channel,
  queue: string,
  { retryDelayMs = RETRY_DELAY_MS }: { retryDelayMs?: number } = {},
): Promise<void> {
  await channel.assertQueue(queue, { durable: true });
  await channel.assertQueue(retryQueue(queue), {
    durable: true,
    arguments: {
      "x-message-ttl": retryDelayMs,
      "x-dead-letter-exchange": "",
      "x-dead-letter-routing-key": queue,
    },
  });
  await channel.assertQueue(deadLetterQueue(queue), { durable: true });
}

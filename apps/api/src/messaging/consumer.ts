import type { Channel, ConsumeMessage } from "amqplib";
import { prisma } from "../db.js";
import type { Prisma } from "../generated/prisma/client.js";
import { deadLetterQueue, MAX_ATTEMPTS, retryQueue } from "./topology.js";

export type Handler<T> = (payload: T, tx: Prisma.TransactionClient) => Promise<void>;

/**
 * Runs a consumer's work once per message. The (consumer, message id) row in processed_messages
 * is inserted in the same transaction as the work, so a redelivered message finds the row and
 * does nothing, and a failed one leaves no row and runs again. The caller acks only after this
 * returns, i.e. after the commit.
 */
export async function processOnce<T>(
  consumer: string,
  messageId: string,
  payload: T,
  handler: Handler<T>,
): Promise<"processed" | "duplicate"> {
  return prisma.$transaction(
    async (tx) => {
      const inserted = await tx.$executeRaw`
        INSERT INTO processed_messages (consumer, message_id) VALUES (${consumer}, ${messageId})
        ON CONFLICT DO NOTHING`;
      if (inserted === 0) return "duplicate";
      await handler(payload, tx);
      return "processed";
    },
    { timeout: 30_000 },
  );
}

const attemptsOf = (message: ConsumeMessage) => Number(message.properties.headers?.["x-attempts"] ?? 0);

/**
 * Consumes a queue. Success: ack. Failure: the message is copied to the retry queue (it comes
 * back after a delay) with its attempt count raised, or to the DLQ after MAX_ATTEMPTS, and the
 * original is acked. Returns a function that stops consuming.
 */
export async function consume<T>(
  channel: Channel,
  queue: string,
  consumer: string,
  handler: Handler<T>,
  { maxAttempts = MAX_ATTEMPTS }: { maxAttempts?: number } = {},
): Promise<() => Promise<void>> {
  await channel.prefetch(10);
  const { consumerTag } = await channel.consume(queue, (message) => {
    if (!message) return;
    void (async () => {
      const messageId = message.properties.messageId as string | undefined;
      try {
        if (!messageId) throw new Error("Message has no messageId");
        const payload = JSON.parse(message.content.toString("utf8")) as T;
        await processOnce(consumer, messageId, payload, handler);
        channel.ack(message);
      } catch (error) {
        const attempts = attemptsOf(message) + 1;
        const target = attempts >= maxAttempts ? deadLetterQueue(queue) : retryQueue(queue);
        console.error(`${consumer}: message ${messageId} failed (attempt ${attempts}), to ${target}`, error);
        channel.sendToQueue(target, message.content, {
          ...message.properties,
          headers: { ...message.properties.headers, "x-attempts": attempts, "x-last-error": String(error) },
        });
        channel.ack(message);
      }
    })();
  });
  return async () => {
    await channel.cancel(consumerTag);
  };
}

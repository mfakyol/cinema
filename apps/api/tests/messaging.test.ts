import { randomUUID } from "node:crypto";
import amqp from "amqplib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db.js";
import { consume, processOnce } from "../src/messaging/consumer.js";
import { type OutboxRow, relayOnce } from "../src/messaging/outbox-relay.js";
import { assertQueueWithRetry, deadLetterQueue } from "../src/messaging/topology.js";
import { recordSale } from "../src/workers/ticket-issued.js";
import { checkout, createFixture, createUser, lock, runWorkers } from "./helpers.js";

async function paidOrder() {
  const { showtime, seats } = await createFixture();
  const { token } = await createUser();
  await lock(token, showtime.id, [seats[0]!.id, seats[1]!.id]).expect(201);
  return (await checkout(token, showtime.id).expect(201)).body.order as { id: string; amount: number };
}

describe("outbox relay", () => {
  it("publishes unpublished events once and marks them", async () => {
    const order = await paidOrder();
    const published: OutboxRow[] = [];
    const publish = async (rows: OutboxRow[]) => {
      published.push(...rows);
    };

    expect(await relayOnce(publish)).toBe(1);
    expect(published).toEqual([expect.objectContaining({ type: "ticket.issued", payload: { orderId: order.id } })]);
    expect(await prisma.outboxEvent.count({ where: { publishedAt: null } })).toBe(0);
    // Nothing left: a second pass sends nothing.
    expect(await relayOnce(publish)).toBe(0);
    expect(published).toHaveLength(1);
  });

  it("keeps events for the next pass when the broker does not confirm them", async () => {
    await paidOrder();
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await relayOnce(async () => Promise.reject(new Error("broker down")))).toBe(0);

    const [event] = await prisma.outboxEvent.findMany();
    expect(event).toMatchObject({ publishedAt: null, attempts: 1, lastError: "Error: broker down" });
    expect(await relayOnce(async () => {})).toBe(1);
  });

  it("never hands the same row to two relays running at once", async () => {
    for (let i = 0; i < 3; i++) await paidOrder();
    const seen: string[] = [];
    // Slow publishes keep both transactions open at the same time; SKIP LOCKED splits the rows.
    const slow = async (rows: OutboxRow[]) => {
      seen.push(...rows.map((row) => row.id));
      await new Promise((resolve) => setTimeout(resolve, 100));
    };
    await Promise.all([relayOnce(slow), relayOnce(slow)]);
    expect(seen).toHaveLength(3);
    expect(new Set(seen).size).toBe(3);
  });
});

describe("idempotent consumers", () => {
  it("handles the same message twice only once", async () => {
    const order = await paidOrder();
    const messageId = randomUUID();

    expect(await processOnce("sales-stats", messageId, { orderId: order.id }, recordSale)).toBe("processed");
    expect(await processOnce("sales-stats", messageId, { orderId: order.id }, recordSale)).toBe("duplicate");

    const [day] = await prisma.dailySales.findMany();
    expect(day).toMatchObject({ channel: "WEB", orders: 1, tickets: 2, revenue: order.amount });
  });

  it("handles the same message delivered twice at the same moment only once", async () => {
    const order = await paidOrder();
    const messageId = randomUUID();
    const results = await Promise.allSettled([
      processOnce("sales-stats", messageId, { orderId: order.id }, recordSale),
      processOnce("sales-stats", messageId, { orderId: order.id }, recordSale),
    ]);
    // One commits; the other finds the row (or waits on it and then finds it).
    expect(results.filter((result) => result.status === "fulfilled" && result.value === "processed")).toHaveLength(1);
    expect((await prisma.dailySales.findFirstOrThrow()).orders).toBe(1);
  });

  it("leaves no processed row when the work fails, so a retry runs it again", async () => {
    const order = await paidOrder();
    const messageId = randomUUID();
    const failing = async () => {
      throw new Error("mail server down");
    };
    await expect(processOnce("email", messageId, { orderId: order.id }, failing)).rejects.toThrow("mail server down");
    expect(await prisma.processedMessage.count({ where: { messageId } })).toBe(0);
    expect(await processOnce("email", messageId, { orderId: order.id }, async () => {})).toBe("processed");
  });

  it("gives each consumer its own record of the same message", async () => {
    await paidOrder();
    const results = await runWorkers();
    expect(Object.values(results)).toEqual(["processed", "processed", "processed"]);
    expect(await prisma.processedMessage.count()).toBe(3);
  });
});

describe("retries and the dead-letter queue (RabbitMQ)", () => {
  let connection: amqp.ChannelModel;
  beforeAll(async () => {
    connection = await amqp.connect(process.env.RABBITMQ_URL!);
  });
  afterAll(async () => {
    await connection.close();
  });

  it("retries a failing message, then parks it in the DLQ", async () => {
    const queue = `test.${randomUUID()}`;
    const channel = await connection.createChannel();
    await assertQueueWithRetry(channel, queue, { retryDelayMs: 50 });
    vi.spyOn(console, "error").mockImplementation(() => {});

    let calls = 0;
    const stop = await consume(
      channel,
      queue,
      `test-${randomUUID()}`,
      async () => {
        calls += 1;
        throw new Error("always fails");
      },
      { maxAttempts: 3 },
    );
    channel.sendToQueue(queue, Buffer.from(JSON.stringify({ orderId: "x" })), { messageId: randomUUID() });

    let parked: amqp.GetMessage | false = false;
    for (let i = 0; i < 50 && !parked; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      parked = await channel.get(deadLetterQueue(queue), { noAck: true });
    }
    await stop();
    for (const name of [queue, `${queue}.retry`, deadLetterQueue(queue)]) await channel.deleteQueue(name);
    await channel.close();

    expect(calls).toBe(3);
    expect(parked).not.toBe(false);
    expect((parked as amqp.GetMessage).properties.headers?.["x-attempts"]).toBe(3);
  }, 15_000);
});

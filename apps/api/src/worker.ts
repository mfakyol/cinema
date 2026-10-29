import { prisma } from "./db.js";
import { installShutdownHandlers, onShutdown } from "./infra/lifecycle.js";
import { closeRabbitMq, connectRabbitMq } from "./infra/rabbitmq.js";
import { closeRedis } from "./infra/redis.js";
import { consume } from "./messaging/consumer.js";
import { publisherFor, startRelay } from "./messaging/outbox-relay.js";
import { assertTopology, QUEUES } from "./messaging/topology.js";
import { recordRefund, refundPayment, sendRefundEmail } from "./workers/order-refunded.js";
import { queueKioskPrint, recordSale, sendTicketEmail } from "./workers/ticket-issued.js";

/**
 * The background process: relays the outbox to RabbitMQ and runs the ticket.issued and
 * order.refunded consumers.
 * It runs apart from the API, so slow email or a broker outage never delays a sale. Run more
 * than one if needed: the relay locks rows with SKIP LOCKED and consumers share their queues.
 */
const connection = await connectRabbitMq();
// A lost broker connection is fatal: exit, get restarted, and resume from the outbox and queues.
connection.on("close", () => {
  console.error("worker: RabbitMQ connection closed");
  process.exit(1);
});

const setup = await connection.createChannel();
await assertTopology(setup);
await setup.close();

const relay = startRelay(publisherFor(await connection.createConfirmChannel()));

// Both events carry just an order id.
const consumers = [
  { queue: QUEUES.email, name: "email", handler: sendTicketEmail },
  { queue: QUEUES.kioskPrint, name: "kiosk-print", handler: queueKioskPrint },
  { queue: QUEUES.salesStats, name: "sales-stats", handler: recordSale },
  { queue: QUEUES.refundPayment, name: "refund-payment", handler: refundPayment },
  { queue: QUEUES.refundEmail, name: "refund-email", handler: sendRefundEmail },
  { queue: QUEUES.refundStats, name: "refund-stats", handler: recordRefund },
];
const stops: (() => Promise<void>)[] = [];
for (const { queue, name, handler } of consumers) {
  // A channel each, so one consumer's prefetch and failures stay its own.
  stops.push(await consume<{ orderId: string }>(await connection.createChannel(), queue, name, handler));
}

// Closed in reverse: stop taking messages and relaying first, then the connections.
onShutdown("database", () => prisma.$disconnect());
onShutdown("redis", () => closeRedis());
onShutdown("rabbitmq", () => {
  connection.removeAllListeners("close");
  return closeRabbitMq();
});
onShutdown("outbox relay", () => relay.stop());
onShutdown("consumers", async () => {
  await Promise.all(stops.map((stop) => stop()));
});
installShutdownHandlers("worker");

console.log(`worker: relaying the outbox and consuming ${consumers.map(({ queue }) => queue).join(", ")}`);

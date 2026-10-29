import amqp, { type ChannelModel } from "amqplib";
import { env } from "../env.js";

let connection: ChannelModel | undefined;

/**
 * The process's single RabbitMQ connection; channels are opened from it as needed. A lost
 * connection is fatal for the worker on purpose: it exits and its supervisor (Docker, systemd,
 * `tsx watch`) starts it again, and unpublished outbox rows and unacked messages are simply
 * picked up again.
 */
export async function connectRabbitMq(): Promise<ChannelModel> {
  if (connection) return connection;
  connection = await amqp.connect(env.RABBITMQ_URL);
  connection.on("error", (error: Error) => console.error("RabbitMQ error", error.message));
  return connection;
}

export async function closeRabbitMq(): Promise<void> {
  const current = connection;
  connection = undefined;
  await current?.close().catch(() => undefined);
}

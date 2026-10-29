import { Redis } from "ioredis";
import { env } from "../env.js";

/**
 * The one Redis connection for commands: seat holds, caches and rate limits. Subscribers need a
 * connection of their own (a subscribed connection can run nothing else), so they `duplicate()`
 * this one.
 */
export const redis = new Redis(env.REDIS_URL, {
  // Fail a command after a couple of reconnect attempts instead of queueing it forever.
  maxRetriesPerRequest: 2,
});

redis.on("error", (error) => console.error("Redis error", error.message));

/** A new connection with the same settings, for SUBSCRIBE. */
export function createRedisSubscriber(): Redis {
  const subscriber = redis.duplicate();
  subscriber.on("error", (error) => console.error("Redis subscriber error", error.message));
  return subscriber;
}

/** Waits for pending replies, then closes. */
export async function closeRedis(...connections: Redis[]): Promise<void> {
  await Promise.all([redis, ...connections].map((connection) => connection.quit().catch(() => undefined)));
}

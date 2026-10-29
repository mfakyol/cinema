import type { Server as HttpServer } from "node:http";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Redis } from "ioredis";
import { Server } from "socket.io";
import { SocketEvent } from "@sinema/shared";
import { forgetExpiredHold, parseHoldKey } from "./holds/seat-holds.js";
import { createRedisSubscriber, redis } from "./infra/redis.js";

let io: Server | undefined;

const room = (showtimeId: string) => `showtime:${showtimeId}`;

/**
 * Socket.io with the Redis adapter: an event emitted by any API instance reaches every client,
 * whichever instance it is connected to. Returns the Redis connections it opened, to close on
 * shutdown.
 */
export function attachRealtime(server: HttpServer): { io: Server; connections: Redis[] } {
  const pub = redis.duplicate();
  const sub = createRedisSubscriber();
  io = new Server(server, { cors: { origin: true }, adapter: createAdapter(pub, sub) });
  io.on("connection", (socket) => {
    socket.on(SocketEvent.JOIN_SHOWTIME, (showtimeId: unknown) => {
      if (typeof showtimeId === "string") void socket.join(room(showtimeId));
    });
  });
  return { io, connections: [pub, sub] };
}

/** Broadcasts to everyone watching a showtime's seat map. A no-op until attached (e.g. in tests). */
export function emitToShowtime(showtimeId: string, event: string, payload: unknown) {
  io?.to(room(showtimeId)).emit(event, payload);
}

/**
 * Tells everyone when a seat hold runs out. Redis publishes an event for every key that expires
 * (notify-keyspace-events "Ex", set in docker-compose and here as a fallback); hold keys are
 * turned into "seat released". With several API instances each would emit it once; the clients
 * only refetch, so a repeat is harmless.
 */
export async function listenForExpiredHolds(): Promise<Redis> {
  await redis.config("SET", "notify-keyspace-events", "Ex").catch(() => {
    console.warn("Could not enable Redis keyspace events; expired holds will show as free on the next refetch");
  });
  const subscriber = createRedisSubscriber();
  const channel = `__keyevent@${redis.options.db ?? 0}__:expired`;
  await subscriber.subscribe(channel);
  subscriber.on("message", (_channel: string, key: string) => {
    const hold = parseHoldKey(key);
    if (!hold) return;
    void forgetExpiredHold(hold.showtimeId, hold.seatId);
    emitToShowtime(hold.showtimeId, SocketEvent.SEAT_RELEASED, { seatIds: [hold.seatId] });
  });
  return subscriber;
}

import { redis } from "./redis.js";

/**
 * Read-through JSON cache in Redis with tag versions for invalidation. Every key includes the
 * current version of its tag; invalidating a tag bumps the version (one INCR), so all its old
 * keys stop being read at once and simply expire. No SCAN or key lists are needed.
 *
 * Tags in use: "showtimes" (every showtime list) and "seatmap:<showtimeId>" (one hall's seats
 * and the sold seats of one showtime).
 */
const versionKey = (tag: string) => `cache:version:${tag}`;

export async function cached<T>(tag: string, key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  const version = (await redis.get(versionKey(tag))) ?? "0";
  const fullKey = `cache:${tag}:v${version}:${key}`;
  const hit = await redis.get(fullKey);
  if (hit !== null) return JSON.parse(hit) as T;
  const value = await load();
  await redis.set(fullKey, JSON.stringify(value), "EX", ttlSeconds);
  return value;
}

export async function invalidate(...tags: string[]): Promise<void> {
  if (tags.length === 0) return;
  const pipeline = redis.pipeline();
  for (const tag of tags) pipeline.incr(versionKey(tag));
  await pipeline.exec();
}

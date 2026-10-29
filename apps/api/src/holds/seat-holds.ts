import { MAX_LOCKS_PER_HOLDER, SEAT_LOCK_TTL_MS } from "@sinema/shared";
import { redis } from "../infra/redis.js";

/**
 * Seat holds live in Redis, not PostgreSQL. A hold is one key per seat, set only if absent and
 * with an expiry, so the seat frees itself when the time is up:
 *
 *   hold:<showtimeId>:<seatId>        -> holder id                  (SET NX PX 10 min)
 *   holds:showtime:<showtimeId>       -> sorted set seatId -> expiry, to read a whole map at once
 *   holds:holder:<holderId>           -> set of "<showtimeId>:<seatId>", to find a holder's seats
 *
 * The seat key is the truth; the two indexes may hold stale members for a moment and are always
 * checked against it. Holds are advisory: what finally stops a seat being sold twice is the
 * partial unique index on Ticket in PostgreSQL.
 */
const holdKey = (showtimeId: string, seatId: string) => `hold:${showtimeId}:${seatId}`;
const showtimeKey = (showtimeId: string) => `holds:showtime:${showtimeId}`;
const holderKey = (holderId: string) => `holds:holder:${holderId}`;

/** A hold's public id, used by clients to release it: "<showtimeId>:<seatId>". */
export const holdId = (showtimeId: string, seatId: string) => `${showtimeId}:${seatId}`;
export function parseHoldId(id: string): { showtimeId: string; seatId: string } | null {
  const [showtimeId, seatId, extra] = id.split(":");
  return showtimeId && seatId && extra === undefined ? { showtimeId, seatId } : null;
}

/** Recognises an expired hold key in Redis keyspace events. */
export function parseHoldKey(key: string): { showtimeId: string; seatId: string } | null {
  const match = /^hold:([^:]+):([^:]+)$/.exec(key);
  return match ? { showtimeId: match[1]!, seatId: match[2]! } : null;
}

/**
 * Holds seats for one holder in one showtime, all or none, in a single atomic step. It also
 * releases the holder's seats in any other showtime (a holder buys for one showtime at a time)
 * and enforces the per-holder limit. Seats the holder already has are simply extended.
 *
 * KEYS: holder set, this showtime's sorted set, then one hold key per seat
 * ARGV: holder, showtime, ttl ms, now ms, limit, then the seat ids
 * Returns {"OK", released...} | {"TAKEN", seatId} | {"LIMIT"}
 */
const HOLD_SCRIPT = `
local holder, showtime = ARGV[1], ARGV[2]
local ttl, now, limit = tonumber(ARGV[3]), tonumber(ARGV[4]), tonumber(ARGV[5])
local seatCount = #ARGV - 5

for i = 1, seatCount do
  local owner = redis.call('GET', KEYS[2 + i])
  if owner and owner ~= holder then return {'TAKEN', ARGV[5 + i]} end
end

local released = {'OK'}
local kept = 0
for _, member in ipairs(redis.call('SMEMBERS', KEYS[1])) do
  local st, seat = string.match(member, '^([^:]+):([^:]+)$')
  local key = 'hold:' .. member
  if redis.call('GET', key) ~= holder then
    redis.call('SREM', KEYS[1], member)
  elseif st ~= showtime then
    redis.call('DEL', key)
    redis.call('ZREM', 'holds:showtime:' .. st, seat)
    redis.call('SREM', KEYS[1], member)
    table.insert(released, member)
  else
    kept = kept + 1
  end
end

local adding = 0
for i = 1, seatCount do
  if redis.call('GET', KEYS[2 + i]) ~= holder then adding = adding + 1 end
end
if kept + adding > limit then return {'LIMIT'} end

local expiresAt = now + ttl
for i = 1, seatCount do
  local seat = ARGV[5 + i]
  redis.call('SET', KEYS[2 + i], holder, 'PX', ttl)
  redis.call('ZADD', KEYS[2], expiresAt, seat)
  redis.call('SADD', KEYS[1], showtime .. ':' .. seat)
end
redis.call('PEXPIRE', KEYS[1], ttl)
redis.call('PEXPIRE', KEYS[2], ttl)
return released
`;

/**
 * Releases holds only if the holder still owns them (compare-and-delete), so a late release
 * never frees a seat someone else has since taken.
 * KEYS: holder set, showtime sorted set, hold keys. ARGV: holder, showtime, seat ids.
 * Returns the seats actually released.
 */
const RELEASE_SCRIPT = `
local holder, showtime = ARGV[1], ARGV[2]
local released = {}
for i = 3, #ARGV do
  local key = KEYS[i]
  if redis.call('GET', key) == holder then
    redis.call('DEL', key)
    redis.call('ZREM', KEYS[2], ARGV[i])
    redis.call('SREM', KEYS[1], showtime .. ':' .. ARGV[i])
    table.insert(released, ARGV[i])
  end
end
return released
`;

/**
 * Confirms the holder still owns every seat and keeps them at least `minMs` longer, for the time
 * a payment takes. KEYS: showtime sorted set, hold keys. ARGV: holder, min ms, now ms, seat ids.
 * Returns 1, or 0 if any seat is no longer theirs (nothing is changed then).
 */
const EXTEND_SCRIPT = `
local holder, minMs, now = ARGV[1], tonumber(ARGV[2]), tonumber(ARGV[3])
for i = 2, #KEYS do
  if redis.call('GET', KEYS[i]) ~= holder then return 0 end
end
for i = 2, #KEYS do
  local left = redis.call('PTTL', KEYS[i])
  if left < minMs then
    redis.call('PEXPIRE', KEYS[i], minMs)
    redis.call('ZADD', KEYS[1], now + minMs, ARGV[2 + i])
  end
end
-- The showtime index must outlive every hold in it.
if redis.call('PTTL', KEYS[1]) < minMs then redis.call('PEXPIRE', KEYS[1], minMs) end
return 1
`;

export type HoldResult =
  | { ok: true; released: { showtimeId: string; seatId: string }[]; expiresAt: Date }
  | { ok: false; reason: "TAKEN" | "LIMIT" };

export async function holdSeats(holderId: string, showtimeId: string, seatIds: string[]): Promise<HoldResult> {
  const now = Date.now();
  const keys = [holderKey(holderId), showtimeKey(showtimeId), ...seatIds.map((seatId) => holdKey(showtimeId, seatId))];
  const args = [holderId, showtimeId, SEAT_LOCK_TTL_MS, now, MAX_LOCKS_PER_HOLDER, ...seatIds];
  const reply = (await redis.eval(HOLD_SCRIPT, keys.length, ...keys, ...args)) as string[];
  if (reply[0] === "TAKEN") return { ok: false, reason: "TAKEN" };
  if (reply[0] === "LIMIT") return { ok: false, reason: "LIMIT" };
  const released = reply.slice(1).map((member) => {
    const [st, seat] = member.split(":");
    return { showtimeId: st!, seatId: seat! };
  });
  return { ok: true, released, expiresAt: new Date(now + SEAT_LOCK_TTL_MS) };
}

export async function releaseHolds(holderId: string, showtimeId: string, seatIds: string[]): Promise<string[]> {
  if (seatIds.length === 0) return [];
  const keys = [holderKey(holderId), showtimeKey(showtimeId), ...seatIds.map((seatId) => holdKey(showtimeId, seatId))];
  return (await redis.eval(RELEASE_SCRIPT, keys.length, ...keys, holderId, showtimeId, ...seatIds)) as string[];
}

export async function extendHolds(holderId: string, showtimeId: string, seatIds: string[], minMs: number) {
  const keys = [showtimeKey(showtimeId), ...seatIds.map((seatId) => holdKey(showtimeId, seatId))];
  const reply = await redis.eval(EXTEND_SCRIPT, keys.length, ...keys, holderId, minMs, Date.now(), ...seatIds);
  return reply === 1;
}

export interface Hold {
  seatId: string;
  holderId: string;
  expiresAt: Date;
}

/** Every live hold in a showtime: the sorted set gives candidates, the seat keys confirm them. */
export async function showtimeHolds(showtimeId: string): Promise<Hold[]> {
  const now = Date.now();
  const members = await redis.zrangebyscore(showtimeKey(showtimeId), now, "+inf", "WITHSCORES");
  if (members.length === 0) return [];
  const seats: { seatId: string; expiresAt: Date }[] = [];
  for (let i = 0; i < members.length; i += 2) {
    seats.push({ seatId: members[i]!, expiresAt: new Date(Number(members[i + 1])) });
  }
  const owners = await redis.mget(seats.map(({ seatId }) => holdKey(showtimeId, seatId)));
  return seats.flatMap((seat, i) => (owners[i] ? [{ ...seat, holderId: owners[i]! }] : []));
}

/** The seats one holder holds in a showtime. */
export async function heldBy(holderId: string, showtimeId: string): Promise<Hold[]> {
  return (await showtimeHolds(showtimeId)).filter((hold) => hold.holderId === holderId);
}

/** How many seats are held right now in each showtime, in one round trip. */
export async function heldCounts(showtimeIds: string[]): Promise<Map<string, number>> {
  if (showtimeIds.length === 0) return new Map();
  const now = Date.now();
  const pipeline = redis.pipeline();
  for (const id of showtimeIds) pipeline.zcount(showtimeKey(id), now, "+inf");
  const replies = (await pipeline.exec()) ?? [];
  return new Map(showtimeIds.map((id, i) => [id, Number(replies[i]?.[1] ?? 0)]));
}

/** Drops an expired seat from its showtime index, once Redis reports the key gone. */
export async function forgetExpiredHold(showtimeId: string, seatId: string): Promise<void> {
  await redis.zrem(showtimeKey(showtimeId), seatId);
}

/**
 * Drops every hold in a showtime, e.g. when it is cancelled. Holders' own sets keep a stale
 * member for a while; it is ignored because the seat key is gone.
 */
export async function releaseShowtimeHolds(showtimeId: string): Promise<string[]> {
  const seatIds = await redis.zrange(showtimeKey(showtimeId), "0", "-1");
  const pipeline = redis.pipeline();
  for (const seatId of seatIds) pipeline.del(holdKey(showtimeId, seatId));
  pipeline.del(showtimeKey(showtimeId));
  await pipeline.exec();
  return seatIds;
}


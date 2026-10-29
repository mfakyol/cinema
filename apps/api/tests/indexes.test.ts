import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { createFixture } from "./helpers.js";

interface PlanNode {
  "Node Type": string;
  "Index Name"?: string;
  Plans?: PlanNode[];
}

/** Every index the plan reads, from EXPLAIN (ANALYZE, FORMAT JSON). */
async function indexesUsed(sql: string, ...params: unknown[]): Promise<string[]> {
  const [row] = await prisma.$queryRawUnsafe<{ "QUERY PLAN": [{ Plan: PlanNode }] }[]>(
    `EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`,
    ...params,
  );
  const names: string[] = [];
  const walk = (node: PlanNode) => {
    if (node["Index Name"]) names.push(node["Index Name"]);
    node.Plans?.forEach(walk);
  };
  walk(row!["QUERY PLAN"][0].Plan);
  return names;
}

/**
 * The planner rightly scans a small table sequentially, so these tests first load a year of
 * showtimes and a long outbox history, refresh the statistics, and then check that the queries
 * the API runs most use their indexes.
 */
describe("query plans", () => {
  it("uses the showtime and outbox indexes on realistic data", async () => {
    const { movie, hall } = await createFixture();
    const other = await prisma.movie.create({
      data: { title: "Other Movie", description: "Fills the schedule.", durationMin: 90, genre: "Drama" },
    });
    // A showtime every 25 minutes for about a year; one in twenty is the movie under test.
    await prisma.$executeRaw`
      INSERT INTO "Showtime" ("id", "movieId", "hallId", "startsAt", "price", "format")
      SELECT gen_random_uuid()::text,
             CASE WHEN i % 20 = 0 THEN ${movie.id} ELSE ${other.id} END,
             ${hall.id}, now() + make_interval(mins => i * 25), 1000, 'TWO_D'
      FROM generate_series(1, 20000) AS i`;
    await prisma.$executeRaw`
      INSERT INTO outbox (id, type, payload, created_at, published_at)
      SELECT gen_random_uuid()::text, 'ticket.issued', '{}'::jsonb, now() - make_interval(secs => i),
             CASE WHEN i > 20 THEN now() END
      FROM generate_series(1, 5000) AS i`;
    await prisma.$executeRawUnsafe('ANALYZE "Showtime"');
    await prisma.$executeRawUnsafe("ANALYZE outbox");

    // The box office's day listing: GET /showtimes?from=&to=
    expect(
      await indexesUsed(
        'SELECT * FROM "Showtime" WHERE "startsAt" >= $1 AND "startsAt" < $2 ORDER BY "startsAt"',
        new Date(Date.now() + 86_400_000),
        new Date(Date.now() + 2 * 86_400_000),
      ),
    ).toContain("Showtime_startsAt_idx");

    // A movie's upcoming showtimes: GET /movies/:id/showtimes
    expect(
      await indexesUsed(
        'SELECT * FROM "Showtime" WHERE "movieId" = $1 AND "startsAt" > now() ORDER BY "startsAt"',
        movie.id,
      ),
    ).toContain("Showtime_movieId_startsAt_idx");

    // The relay's poll: only the small partial index of unpublished rows is read.
    expect(
      await indexesUsed("SELECT id FROM outbox WHERE published_at IS NULL ORDER BY created_at LIMIT 50"),
    ).toContain("outbox_unpublished_idx");
  }, 30_000);
});

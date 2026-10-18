import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import pg from "pg";
import { TEST_DATABASE_URL, TEST_ENV } from "./test-env.js";

/** Creates the test database if needed and applies migrations to it. */
export default async function setup() {
  const url = new URL(TEST_DATABASE_URL);
  const database = url.pathname.slice(1);
  url.pathname = "/postgres";

  const admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
  try {
    const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
    if (!rowCount) await admin.query(`CREATE DATABASE "${database}"`);
  } finally {
    await admin.end();
  }

  const prismaPackage = createRequire(import.meta.url).resolve("prisma/package.json");
  const prismaCli = join(dirname(prismaPackage), "build", "index.js");
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    env: { ...process.env, ...TEST_ENV },
    stdio: "pipe",
  });
}

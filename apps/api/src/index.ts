import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./env.js";
import { attachRealtime } from "./realtime.js";
import { releaseExpiredLocks } from "./services/locks.js";

const LOCK_SWEEP_INTERVAL_MS = 15_000;

const server = createServer(createApp());
attachRealtime(server);

setInterval(() => {
  releaseExpiredLocks().catch((error) => console.error("Lock sweep failed", error));
}, LOCK_SWEEP_INTERVAL_MS);

server.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});

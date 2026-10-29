import { createServer } from "node:http";
import { createApp } from "./app.js";
import { prisma } from "./db.js";
import { env } from "./env.js";
import { closeRedis } from "./infra/redis.js";
import { installShutdownHandlers, onShutdown } from "./infra/lifecycle.js";
import { attachRealtime, listenForExpiredHolds } from "./realtime.js";

const server = createServer(createApp());
const realtime = attachRealtime(server);
const expiryListener = await listenForExpiredHolds();

// Closed in reverse: stop taking requests and sockets first, then the connections they used.
onShutdown("database", () => prisma.$disconnect());
onShutdown("redis", () => closeRedis(expiryListener, ...realtime.connections));
onShutdown("socket.io", () => new Promise<void>((resolve) => realtime.io.close(() => resolve())));
onShutdown("http server", () => new Promise<void>((resolve) => server.close(() => resolve())));
installShutdownHandlers("api");

server.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});

/**
 * Graceful shutdown. Each part of the process registers how to close itself as it starts; on
 * SIGINT or SIGTERM they close in reverse order (stop taking work first, then the connections
 * that work needed), and the process exits once all are done or after a deadline.
 */
type Closer = { name: string; close: () => Promise<void> | void };

const closers: Closer[] = [];
const DEADLINE_MS = 10_000;
let stopping = false;

export function onShutdown(name: string, close: Closer["close"]): void {
  closers.push({ name, close });
}

export function installShutdownHandlers(processName: string): void {
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`${processName}: ${signal} received, shutting down`);
    const deadline = setTimeout(() => {
      console.error(`${processName}: shutdown took longer than ${DEADLINE_MS} ms, exiting`);
      process.exit(1);
    }, DEADLINE_MS);
    deadline.unref();

    for (const { name, close } of [...closers].reverse()) {
      try {
        await close();
      } catch (error) {
        console.error(`${processName}: closing ${name} failed`, error);
      }
    }
    process.exit(0);
  };
  process.once("SIGINT", () => void stop("SIGINT"));
  process.once("SIGTERM", () => void stop("SIGTERM"));
}

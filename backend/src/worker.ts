import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { db } from "./db.js";
import { createBroker } from "./messaging/index.js";
import { publishOutbox } from "./messaging/outbox.js";
import { handleDelivery, recoverJobs } from "./services/processing.js";
import { log } from "./middleware/errors.js";
import { config } from "./config.js";
const name = `${hostname()}-${randomUUID().slice(0, 8)}`;
let stopping = false,
  broker = createBroker(),
  consuming = false;
const active = new Set<Promise<void>>();
const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
async function run() {
  while (!stopping) {
    try {
      await db.$queryRaw`SELECT 1`;
      const health = await broker.health();
      if (!health.connected) {
        await broker.close().catch(() => {});
        broker = createBroker();
        await broker.connect();
        consuming = false;
      }
      if (!consuming) {
        await broker.consume((delivery) => {
          const task = handleDelivery(delivery, name);
          active.add(task);
          void task.finally(() => active.delete(task)).catch(() => {});
          return task;
        });
        consuming = true;
      }
      await db.workerHeartbeat.upsert({
        where: { name },
        create: { name, provider: config.MESSAGING_PROVIDER },
        update: { lastSeen: new Date(), provider: config.MESSAGING_PROVIDER },
      });
      await recoverJobs();
      await publishOutbox(broker);
      await pause(1000);
    } catch (error) {
      log({
        level: "error",
        worker: name,
        errorCategory: "worker_infrastructure",
        error: String(error),
      });
      await pause(3000);
    }
  }
  // Stop new deliveries, let owned work durably finish, then close its acknowledgement channel.
  await broker.stopConsuming().catch(() => {});
  await Promise.allSettled([...active]);
  await broker.close().catch(() => {});
  await db.workerHeartbeat.deleteMany({ where: { name } }).catch(() => {});
  await db.$disconnect();
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopping = true;
  });
void run();

import { db } from "../db.js";
import { eventSchema, type Broker } from "./contract.js";
import { log } from "../middleware/errors.js";
export async function publishOutbox(broker: Broker, limit = 25) {
  let published = 0;
  for (let i = 0; i < limit; i++) {
    const now = new Date();
    const item = await db.outboxEvent.findFirst({
      where: {
        publishedAt: null,
        availableAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      orderBy: { createdAt: "asc" },
    });
    if (!item) break;
    const claim = await db.outboxEvent.updateMany({
      where: {
        id: item.id,
        publishedAt: null,
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      data: {
        leaseUntil: new Date(Date.now() + 30000),
        attempts: { increment: 1 },
      },
    });
    if (!claim.count) continue;
    try {
      await broker.publish(
        eventSchema.parse(item.payload),
        item.destination === "dead" ? "dead" : "work",
      );
      await db.outboxEvent.update({
        where: { id: item.id },
        data: { publishedAt: new Date(), leaseUntil: null, error: null },
      });
      published++;
      log({
        type: "published",
        eventId: item.id,
        jobId: item.jobId,
        destination: item.destination,
      });
    } catch (error) {
      await db.outboxEvent.update({
        where: { id: item.id },
        data: {
          leaseUntil: null,
          availableAt: new Date(
            Date.now() +
              Math.min(60000, 1000 * 2 ** Math.min(item.attempts, 6)),
          ),
          error: "Broker publication failed; retry scheduled",
        },
      });
      log({
        level: "error",
        eventId: item.id,
        errorCategory: "publication",
        error: String(error),
      });
      throw error;
    }
  }
  return published;
}

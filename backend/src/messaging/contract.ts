import { z } from "zod";
export const eventSchema = z
  .object({
    eventId: z.string().uuid(),
    jobId: z.string().uuid(),
    schemaVersion: z.literal(1),
    correlationId: z.string().min(1),
  })
  .strict();
export type JobEvent = z.infer<typeof eventSchema>;
export interface Delivery {
  event: JobEvent;
  ack(): Promise<void>;
  release(): Promise<void>;
  deadLetter(reason: string): Promise<void>;
}
export interface Broker {
  connect(): Promise<void>;
  publish(event: JobEvent, destination?: "work" | "dead"): Promise<void>;
  consume(handler: (delivery: Delivery) => Promise<void>): Promise<void>;
  stopConsuming(): Promise<void>;
  health(): Promise<{
    connected: boolean;
    queued: number | null;
    deadLettered: number | null;
  }>;
  close(): Promise<void>;
}

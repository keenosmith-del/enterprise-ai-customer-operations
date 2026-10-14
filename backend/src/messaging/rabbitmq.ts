import amqp, { type ChannelModel, type ConfirmChannel } from "amqplib";
import { config } from "../config.js";
import {
  eventSchema,
  type Broker,
  type Delivery,
  type JobEvent,
} from "./contract.js";
import { log } from "../middleware/errors.js";
export const WORK_QUEUE = `${config.RABBITMQ_QUEUE_PREFIX}.work`,
  DEAD_QUEUE = `${config.RABBITMQ_QUEUE_PREFIX}.dead`;
export class RabbitBroker implements Broker {
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private connected = false;
  private consumerTag?: string;
  async connect() {
    this.connection = await amqp.connect(config.RABBITMQ_URL, {
      timeout: 5000,
    });
    this.connection.on("error", () => {
      this.connected = false;
    });
    this.connection.on("close", () => {
      this.connected = false;
    });
    this.channel = await this.connection.createConfirmChannel();
    this.channel.on("error", () => {
      this.connected = false;
    });
    this.channel.on("close", () => {
      this.connected = false;
    });
    await this.channel.assertExchange(
      `${config.RABBITMQ_QUEUE_PREFIX}.dead`,
      "direct",
      {
        durable: true,
      },
    );
    await this.channel.assertQueue(DEAD_QUEUE, { durable: true });
    await this.channel.bindQueue(
      DEAD_QUEUE,
      `${config.RABBITMQ_QUEUE_PREFIX}.dead`,
      "dead",
    );
    await this.channel.assertQueue(WORK_QUEUE, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": `${config.RABBITMQ_QUEUE_PREFIX}.dead`,
        "x-dead-letter-routing-key": "dead",
      },
    });
    await this.channel.prefetch(1);
    this.connected = true;
  }
  async publish(event: JobEvent, destination: "work" | "dead" = "work") {
    const channel = this.channel;
    if (!channel || !this.connected) throw new Error("RabbitMQ unavailable");
    // Queues are declared on this channel; mandatory returns are treated as failures.
    await new Promise<void>((resolve, reject) => {
      const returned = () =>
        reject(new Error("Unroutable RabbitMQ publication"));
      channel.once("return", returned);
      channel.sendToQueue(
        destination === "dead" ? DEAD_QUEUE : WORK_QUEUE,
        Buffer.from(JSON.stringify(event)),
        {
          persistent: true,
          mandatory: true,
          messageId: event.eventId,
          correlationId: event.correlationId,
          contentType: "application/json",
        },
        (err) => {
          channel.off("return", returned);
          if (err) reject(err);
          else resolve();
        },
      );
    });
  }
  async consume(handler: (delivery: Delivery) => Promise<void>) {
    const channel = this.channel!;
    const consumer = await channel.consume(
      WORK_QUEUE,
      async (message) => {
        if (!message) {
          this.connected = false;
          return;
        }
        let event: JobEvent;
        try {
          event = eventSchema.parse(JSON.parse(message.content.toString()));
        } catch {
          channel.nack(message, false, false);
          return;
        }
        try {
          await handler({
            event,
            ack: async () => {
              channel.ack(message);
            },
            release: async () => {
              channel.nack(message, false, true);
            },
            deadLetter: async () => {
              await this.publish(event, "dead");
              channel.ack(message);
            },
          });
        } catch (error) {
          log({
            level: "error",
            eventId: event.eventId,
            errorCategory: "delivery",
            error: String(error),
          });
          try {
            channel.nack(message, false, true);
          } catch {
            /* Connection loss requeues unsettled deliveries. */
          }
        }
      },
      { noAck: false },
    );
    this.consumerTag = consumer.consumerTag;
  }
  async stopConsuming() {
    if (this.channel && this.consumerTag)
      await this.channel.cancel(this.consumerTag);
    this.consumerTag = undefined;
  }
  async health() {
    if (!this.connected || !this.channel)
      return { connected: false, queued: null, deadLettered: null };
    const [work, dead] = await Promise.all([
      this.channel.checkQueue(WORK_QUEUE),
      this.channel.checkQueue(DEAD_QUEUE),
    ]);
    return {
      connected: true,
      queued: work.messageCount,
      deadLettered: dead.messageCount,
    };
  }
  async close() {
    this.connected = false;
    await this.channel?.close().catch(() => {});
    await this.connection?.close().catch(() => {});
  }
}

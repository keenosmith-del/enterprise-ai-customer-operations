import {
  ServiceBusClient,
  type ServiceBusSender,
  type ServiceBusReceiver,
} from "@azure/service-bus";
import { config } from "../config.js";
import {
  eventSchema,
  type Broker,
  type Delivery,
  type JobEvent,
} from "./contract.js";
import { log } from "../middleware/errors.js";
// Namespace and queue provisioning belongs to the operator. Peek-lock settlement differs from AMQP acknowledgement.
export class AzureBroker implements Broker {
  private sender?: ServiceBusSender;
  private receiver?: ServiceBusReceiver;
  private connected = false;
  private subscription?: { close(): Promise<void> };
  constructor(
    private client = new ServiceBusClient(
      config.AZURE_SERVICE_BUS_CONNECTION_STRING!,
    ),
  ) {}
  async connect() {
    this.sender = this.client.createSender(config.AZURE_SERVICE_BUS_QUEUE);
    this.receiver = this.client.createReceiver(config.AZURE_SERVICE_BUS_QUEUE, {
      receiveMode: "peekLock",
      maxAutoLockRenewalDurationInMs: 3600000,
    });
    await this.receiver.peekMessages(1);
    this.connected = true;
  }
  async publish(event: JobEvent, destination: "work" | "dead" = "work") {
    if (!this.sender || !this.connected)
      throw new Error("Azure Service Bus unavailable");
    // Application failure archives use a separate queue; broker-native malformed deliveries use its DLQ.
    if (destination === "dead") {
      const sender = this.client.createSender(
        `${config.AZURE_SERVICE_BUS_QUEUE}-failed`,
      );
      try {
        await sender.sendMessages({
          body: event,
          messageId: event.eventId,
          correlationId: event.correlationId,
        });
      } finally {
        await sender.close();
      }
    } else
      await this.sender.sendMessages({
        body: event,
        messageId: event.eventId,
        correlationId: event.correlationId,
      });
  }
  async consume(handler: (delivery: Delivery) => Promise<void>) {
    const receiver = this.receiver!;
    this.subscription = receiver.subscribe(
      {
        processMessage: async (message) => {
          const parsed = eventSchema.safeParse(message.body);
          if (!parsed.success) {
            await receiver.deadLetterMessage(message, {
              deadLetterReason: "Invalid event schema",
              deadLetterErrorDescription: "Event failed application validation",
            });
            return;
          }
          try {
            await handler({
              event: parsed.data,
              ack: () => receiver.completeMessage(message),
              release: () => receiver.abandonMessage(message),
              deadLetter: (reason) =>
                receiver.deadLetterMessage(message, {
                  deadLetterReason: reason,
                  deadLetterErrorDescription: reason,
                }),
            });
          } catch (error) {
            await receiver.abandonMessage(message);
            log({
              eventId: parsed.data.eventId,
              errorCategory: "delivery",
              error: String(error),
            });
          }
        },
        processError: async (args) => {
          this.connected = false;
          log({ errorCategory: "azure_receiver", error: String(args.error) });
        },
      },
      { autoCompleteMessages: false, maxConcurrentCalls: 1 },
    );
  }
  async stopConsuming() {
    await this.subscription?.close();
  }
  async health() {
    return { connected: this.connected, queued: null, deadLettered: null };
  }
  async close() {
    this.connected = false;
    await this.receiver?.close();
    await this.sender?.close();
    await this.client.close();
  }
}

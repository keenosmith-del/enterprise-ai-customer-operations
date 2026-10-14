import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { AzureBroker } from "../messaging/azure.js";
import { RabbitBroker } from "../messaging/rabbitmq.js";
import amqp from "amqplib";
import type { JobEvent } from "../messaging/contract.js";
const event: JobEvent = {
  eventId: randomUUID(),
  jobId: randomUUID(),
  schemaVersion: 1,
  correlationId: "test",
};
function azureStub() {
  let handlers: any, options: any;
  const sender = {
    sendMessages: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const receiver = {
    peekMessages: vi.fn().mockResolvedValue([]),
    subscribe: vi.fn((h, o) => {
      handlers = h;
      options = o;
      return { close: vi.fn().mockResolvedValue(undefined) };
    }),
    completeMessage: vi.fn().mockResolvedValue(undefined),
    abandonMessage: vi.fn().mockResolvedValue(undefined),
    deadLetterMessage: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const client = {
    createSender: vi.fn(() => sender),
    createReceiver: vi.fn(() => receiver),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    client,
    sender,
    receiver,
    get handlers() {
      return handlers;
    },
    get options() {
      return options;
    },
  };
}
describe("Azure mocked adapter contract (not live connectivity)", () => {
  it("uses peek-lock/manual completion and successful publish awaits SDK", async () => {
    const stub = azureStub(),
      broker = new AzureBroker(stub.client as any);
    await broker.connect();
    await broker.publish(event);
    expect(stub.sender.sendMessages).toHaveBeenCalledWith(
      expect.objectContaining({ body: event, messageId: event.eventId }),
    );
    await broker.consume(async (d) => d.ack());
    await stub.handlers.processMessage({ body: event });
    expect(stub.client.createReceiver).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ receiveMode: "peekLock" }),
    );
    expect(stub.options.autoCompleteMessages).toBe(false);
    expect(stub.receiver.completeMessage).toHaveBeenCalledOnce();
    expect((await broker.health()).queued).toBeNull();
    await broker.close();
  });
  it("abandons on handler failure and dead-letters malformed events", async () => {
    const stub = azureStub(),
      broker = new AzureBroker(stub.client as any);
    await broker.connect();
    await broker.consume(async () => {
      throw new Error("db unavailable");
    });
    await stub.handlers.processMessage({ body: event });
    expect(stub.receiver.abandonMessage).toHaveBeenCalledOnce();
    await stub.handlers.processMessage({ body: { wrong: "schema" } });
    expect(stub.receiver.deadLetterMessage).toHaveBeenCalledOnce();
    expect(stub.receiver.completeMessage).not.toHaveBeenCalled();
    await broker.close();
  });
  it("propagates send failure and supports native terminal settlement", async () => {
    const stub = azureStub(),
      broker = new AzureBroker(stub.client as any);
    await broker.connect();
    stub.sender.sendMessages.mockRejectedValueOnce(new Error("network"));
    await expect(broker.publish(event)).rejects.toThrow();
    await broker.consume(async (d) => d.deadLetter("Terminal"));
    await stub.handlers.processMessage({ body: event });
    expect(stub.receiver.deadLetterMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ deadLetterReason: "Terminal" }),
    );
    await broker.publish(event, "dead");
    expect(stub.client.createSender).toHaveBeenCalledWith(
      expect.stringMatching(/-failed$/),
    );
    await broker.close();
  });
});
describe("RabbitMQ mocked confirms contract", () => {
  it("waits for confirmation and does not ack before handler completion", async () => {
    let callback: any, consumer: any;
    const channel = {
      on: vi.fn(),
      once: vi.fn(),
      off: vi.fn(),
      assertExchange: vi.fn(),
      assertQueue: vi.fn(),
      bindQueue: vi.fn(),
      prefetch: vi.fn(),
      sendToQueue: vi.fn((_q, _body, _opts, cb) => {
        callback = cb;
      }),
      consume: vi.fn((_q, cb) => {
        consumer = cb;
        return { consumerTag: "test" };
      }),
      ack: vi.fn(),
      nack: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const connection = {
      on: vi.fn(),
      createConfirmChannel: vi.fn().mockResolvedValue(channel),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(amqp, "connect").mockResolvedValueOnce(connection as any);
    const broker = new RabbitBroker();
    await broker.connect();
    let confirmed = false;
    const publish = broker.publish(event).then(() => {
      confirmed = true;
    });
    await Promise.resolve();
    expect(confirmed).toBe(false);
    callback(null);
    await publish;
    expect(channel.sendToQueue.mock.calls[0][2]).toMatchObject({
      persistent: true,
      mandatory: true,
    });
    let complete: any;
    const work = new Promise<void>((resolve) => {
      complete = resolve;
    });
    await broker.consume(async (d) => {
      await work;
      await d.ack();
    });
    const processing = consumer({
      content: Buffer.from(JSON.stringify(event)),
    });
    expect(channel.ack).not.toHaveBeenCalled();
    complete();
    await processing;
    expect(channel.ack).toHaveBeenCalledOnce();
    await broker.close();
    vi.restoreAllMocks();
  });
});

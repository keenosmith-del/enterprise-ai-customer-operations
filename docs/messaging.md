# Messaging and reliability

`messaging/contract.ts` defines `{eventId, jobId, schemaVersion: 1, correlationId}` and publish/consume/settlement operations. Both brokers provide at-least-once delivery. Database job state is the authority for completion; duplicate publications are expected.

`RABBITMQ_QUEUE_PREFIX` defaults to operations (integration tests use operations-test). RabbitMQ declares durable `operations.work` and `operations.dead` queues and durable direct exchange `operations.dead`, bound with routing key `dead`. Work queue malformed/rejected messages dead-letter through that exchange. Publisher uses persistent messages, mandatory routing and publisher confirms. Consumers use manual acknowledgement and prefetch=1. Application exhausted jobs are durably archived to the dead queue through the outbox.

The transactional outbox is created with the case/job transaction. Publisher claims records with a database lease, publishes with confirmation and then marks them published. A crash between confirm and that update may publish twice. The worker must commit results before acknowledgement.

Retries are scheduled in PostgreSQL/outbox, not in an in-memory timeout or RabbitMQ TTL queue. This keeps retry due times, failure state and durable ownership together across broker adapters. Policy: finite `MAX_ATTEMPTS` (default 3), delay `RETRY_BASE_MS * 2^(attempt-1)` (default 2s, 4s). Failed delivery ownership transfers to a committed retry/dead outbox record before acknowledging the original. The publisher later transfers it to the broker. Operator replay creates an auditable new job and preserves the failed original.

Azure uses the supported `@azure/service-bus` SDK with peek-lock receiving, auto-complete disabled, lock renewal, complete/abandon/native dead-letter settlement. Application archived failures publish to a separately provisioned `<queue>-failed` queue. Broker-native malformed messages use the built-in DLQ. Cloud queue depth is unavailable without a management integration; show null. Provision both queues, avoid broker duplicate-detection windows that suppress intentional re-publication, configure adequate lock duration and native max delivery count. Credentials are optional locally. Mock adapter tests are distinct from live Azure verification.

Authoritative transport references: [RabbitMQ confirms and acknowledgements](https://www.rabbitmq.com/docs/confirms), [Azure JavaScript SDK](https://learn.microsoft.com/en-us/javascript/api/overview/azure/service-bus-readme?view=azure-node-latest).

Worker/publisher loops and recovery have been verified with real local PostgreSQL/RabbitMQ integration tests. Live Azure remains unverified.

## Implemented worker trace

1. `services/cases.ts:createCase` validates input, then inserts case + timeline + job + outbox through one Prisma transaction.
2. `worker.ts` runs independently, connects/reconnects transport, updates heartbeat, recovers leases and calls `messaging/outbox.ts:publishOutbox`.
3. Publisher leases eligible rows for 30s, waits for broker confirmation, records publication. Failed publication remains pending with capped backoff (up to 60s).
4. Broker hands `Delivery` to `services/processing.ts:handleDelivery`. A row lock claims a Queued/Retrying job, increments its finite attempt and starts a 120s lease renewed every 30s.
5. Worker loads exact prompt IDs, calls provider/validates output and commits case/result/timeline/job completion and attempt duration atomically.
6. Only then does it acknowledge. A redelivered successful/failed/already-owned job is acknowledged without repeating its human-facing result. If an owned job is unfinished, lease recovery supplies a fresh durable event.
7. On inference failure the transaction records the attempt and retry due time plus a new outbox event. Terminal failures create a dead-destination outbox and Failed state. Acknowledgement transfers ownership to that durable record.
8. Every sweep recovers expired Processing leases and re-enqueues overdue published Queued/Retrying work after a two-minute grace period. A crash can repeat provider calls, but transactional result commit is guarded by lease ownership and unique example constraints.

Evaluation jobs persist each example independently, then aggregate. Retries skip already committed examples. Running jobs with changed provider configuration fail explicitly rather than mixing model identities.

Database outages prevent acknowledgement; transport releases/requeues deliveries. Publisher can duplicate after a crash/confirm ambiguity. No exactly-once broker guarantee is claimed. Dead queues preserve historical archives; replay does not remove the original archive, and their depth differs from eligible failed-job count.

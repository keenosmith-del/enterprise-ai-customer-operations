# Tests and verification

Run from root:

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:integration
```

Test scripts explicitly select demo AI and RabbitMQ, so a live-provider setting in backend/.env never triggers paid inference during tests. Unit tests require no paid services or running database. Backend test environment reads backend/.env (or CI process variables); Prisma client must be generated. Integration tests require real PostgreSQL/RabbitMQ with the schema migrated. They add synthetic test work into the configured database, so prefer a dedicated disposable test database. Do not point them at production data.

## Coverage

- `backend/src/tests/unit.test.ts`: case/review/filter contracts, strict output schema, policy escalation, template validation, operator restriction, deterministic provider, scoring formulas, bounded backoff, event schema, Fetch provider requests/usage and invalid JSON/429/timeout failures.
- `backend/src/tests/adapters.test.ts`: RabbitMQ publisher-confirm/manual acknowledgement timing; Azure peek-lock, manual completion, abandonment, native dead-letter, failed-archive queue and propagated publish failure. **Mocks do not verify live Azure connectivity.**
- `backend/src/tests/integration.test.ts`: actual case/outbox persistence, malformed JSON/body-size statuses, RabbitMQ delivery, duplicate delivery barrier, human audit/state transitions, optimistic concurrency, version immutability/gates/activation/runtime use, 36-example asynchronous evaluation and comparison, transient retry, exhausted/dead-lettered failure, failed replay and crash-lease recovery. Seed repeatability is checked.
- `frontend/src/components/workflows.test.tsx`: native form validity and Fetch submission, API errors, loading/error/empty/retry, simulated metric caveat and null usage, persisted version selection, and complete-app Strict Mode mounting/navigation under API failure and wrapped scroll behavior.
- CI provisions PostgreSQL and RabbitMQ services and runs install/generate/migrate/typecheck/lint/unit/frontend/integration/build. Hosted Actions execution is separate from local execution.

## Verified results — 2026-10-14

- Backend unit/adapter tests: **17 passed**; frontend workflow tests: **6 passed**.
- Real PostgreSQL/RabbitMQ integration suite: **9 passed**, including duplicate delivery, retries, dead-letter publication, replay, expired-worker recovery, reviews, prompt/runtime version control and evaluation. Repeated after final policy/integrity changes against `operations_test` and `operations-test.*` queues.
- Type checks, ESLint, backend production compilation and frontend production build: passed.
- Two Prisma migrations deployed successfully. Seed repeated without duplicate examples or resetting active versions.
- Full Compose images built and services started. Real API/database/RabbitMQ health and independent worker heartbeat were confirmed.
- Browser workflow: created/queued a case, observed the worker's persisted classification, edited/approved draft, resolved and refreshed with persistent audit. Created/saved a selected prompt draft, queued an actual 36-example evaluation, viewed attributed results, opened baseline comparison and activated with an explicit demo-only override recorded in the audit.
- Desktop overview, 390px mobile case detail/navigation and 820px tablet Prompt Studio inspected. Screenshot evidence is in `docs/screenshots`.
- npm installation audit reported zero vulnerabilities after dependency corrections.

Integration test command chooses `operations-test` RabbitMQ prefix automatically. Use a separate test database and migrate it first, for example (adjust PostgreSQL port if using defaults):

```sh
DATABASE_URL=postgresql://operations:operations_local@localhost:55432/operations_test npm run db:migrate
DATABASE_URL=postgresql://operations:operations_local@localhost:55432/operations_test npm run test:integration
```

Create the disposable database beforehand in this project's PostgreSQL container: `docker compose exec -T postgres psql -U operations -d postgres -c 'CREATE DATABASE operations_test;'`. Do not run tests concurrently against the same test database/prefix. The GitHub Actions service database is already isolated.

## Manual workflow checks

Create a case → wait for persisted recommendation → correct/approve/resolve → refresh and inspect audit history. Create a prompt draft → run an evaluation → compare runs → activate with explicit demo override → create another case and inspect captured versions. On Operations, simulate transient/permanent failure against an open processed case, inspect attempts, replay an exhausted job.

Real-provider tests stub Fetch and verify request/response contracts; they do not prove real model accuracy or live provider compatibility. No real LLM or Azure credentials have been used. Hosted GitHub Actions has not been executed in this local session. Live external-provider/Azure tests and production deployment remain unverified.

# Version 1 implementation report

Verified locally on 2026-10-14. No Git staging, commits, pushes, merges or history changes were performed.

## Deliverable

Integrated React operator workspace, Express API, PostgreSQL persistence/migrations, real RabbitMQ background processing, prompt management/evaluation, configurable AI providers and operational recovery. All five navigation areas use real APIs. Demo AI is explicitly simulated; responses remain drafts for human review.

## Folder structure

```text
frontend/
  src/
    api/          Fetch client and response types
    components/   Forms, table, modal, metrics, states and frontend tests
    hooks/        Polling resource state
    pages/        Overview, Cases/detail, Prompt Studio, Evaluations, Operations
    styles/       Responsive cream/charcoal design
    App.tsx       Routing, navigation and local operator access
    main.tsx      React entry point
  Dockerfile, vite.config.ts, tsconfig.json, .env.example, package.json
backend/
  prisma/
    schema.prisma
    migrations/   Initial schema; prompt/replay/state integrity migration
    seed.ts       Repeatable prompts, 36 labels and 8 queued synthetic cases
  src/
    routes/       Thin REST routers
    services/     Cases, prompts, evaluations, jobs, processing, operations
    messaging/    Contract, RabbitMQ/Azure adapters, transactional outbox publisher
    ai/           Providers, strict output schema, rendering and business policy
    evaluation/   Classification/scoring mathematics
    middleware/   Safe errors, structured logging, operator restriction
    tests/        Unit, broker contract and real integration tests
    app.ts        HTTP concerns and route composition
    server.ts     API lifecycle
    worker.ts     Independent consumer/publisher/recovery lifecycle
    config.ts     Validated environment
    db.ts         Shared Prisma client
  Dockerfile, tsconfig.json, .env.example, package.json
.github/workflows/ci.yml
docs/             Architecture, API, AI, messaging, setup, testing, development log
package.json, package-lock.json, eslint.config.js, docker-compose.yml, README.md
```

## Trace and key files

`CaseForm.tsx` → `api/client.ts` → `routes/cases.ts` → `services/cases.ts` → case/job/outbox transaction. `worker.ts` → `messaging/outbox.ts` → confirmed RabbitMQ publication → `messaging/rabbitmq.ts` → `services/processing.ts` → `ai/providers.ts` → durable result/timeline/job completion → acknowledgement.

`services/prompts.ts` owns immutable versioning, one active version and audited activation. `services/evaluations.ts` queues runs and compares completed results. `evaluation/scoring.ts` implements actual formulas. `prisma/schema.prisma` and SQL migrations enforce relationships, uniqueness and allowed lifecycle states. `services/jobs.ts` owns queue creation/replay. `Operations.tsx` exposes real status, failure inspection and backend-controlled simulation/replay.

## API

- GET `/api/health`, `/api/dashboard`, operator-protected `/api/metrics`.
- GET/POST `/api/cases`, GET `/api/cases/:id`, POST `/:id/reviews`, `/:id/reprocess`.
- GET `/api/prompts`, POST `/:templateId/versions`, PATCH `/versions/:id`, POST `/versions/:id/activate`.
- GET/POST `/api/evaluations`, GET `/datasets`, `/:id`, `/compare?baseline=UUID&candidate=UUID`.
- Operator-protected GET `/api/operations`, POST `/jobs/:id/replay`, `/simulate`.

[Complete contracts, validation, errors and examples](api.md).

## Persistence and delivery

PostgreSQL stores cases/events/reviews, templates/versions/activations, labelled datasets/runs/results, jobs/attempts/outbox and heartbeat. Jobs capture exact prompt versions. Case creation and enqueue are atomic. Workers claim rows under locks, renew leases and verify ownership before committing. Unique example results enable evaluation resume. Finite retries default to three attempts with 2s/4s delays in the durable outbox. Exhausted jobs archive to RabbitMQ dead queue; replay creates a separate audited job. Message delivery is at least once, with idempotent durable completion; provider calls may repeat after a crash.

Azure preserves the same publish/consume contract using peek-lock completion/abandon/dead-letter and SDK lock renewal. Its application failure archive uses a separately provisioned queue. Queue depth is unavailable, and only mocked adapter behavior has been verified.

## AI and evaluations

`LLM_PROVIDER=demo` works offline with deterministic classification and explicitly simulated results, no invented usage/cost. `LLM_PROVIDER=openai` uses private `LLM_API_KEY`, external `LLM_BASE_URL` and `LLM_MODEL` through Fetch. Two versioned policies run classification and response drafting. Zod validates both outputs; routing/escalation rules apply after classification. Customer JSON is separated from system policy.

Evaluations process 36 synthetic labelled examples asynchronously. Results include category/priority accuracy, per-class precision/recall/F1, six-class macro-F1, schema compliance, mean attempted inference latency and errors. Tokens/cost remain null unless actually measurable. Comparison provides metric deltas and example regressions. Only real-provider runs satisfy configured activation thresholds; demo activation requires an explicit recorded override.

## Verification

- Backend unit + mocked broker contracts: 17 passed.
- Frontend workflow tests: 6 passed.
- Real PostgreSQL/RabbitMQ integration tests: 9 passed, including duplicates/retry/DLQ/replay/crash recovery/reviews/escalation routing/prompts/evaluations/seed repeatability.
- Typecheck, ESLint, backend compilation and frontend production build: passed.
- npm dependency audit: zero vulnerabilities reported.
- Full Docker Compose build/start: succeeded; actual API/database/broker and independent worker health confirmed.
- Browser: case creation, asynchronous recommendation, edited approval, resolution and refresh persistence; desktop, 390px mobile and 820px tablet inspected. Browser-created prompt v3 was evaluated/compared/activated with an audited demo override; a subsequent safety case captured v3 and required Critical human review.

[Testing details and limitations](testing.md).

## Start commands

Current ignored session configuration avoids another project's occupied ports:

```sh
docker compose up -d --build
# Open http://localhost:55173
```

Fresh clone/default ports:

```sh
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
docker compose up -d --build
# Open http://localhost:5173
```

Source development (three service terminals after install/migrate/seed):

```sh
npm ci
npm exec -w backend -- prisma generate
docker compose up -d postgres rabbitmq
npm run db:migrate
npm run db:seed
npm run dev -w backend
npm run worker -w backend
npm run dev -w frontend
```

Enter backend `ADMIN_TOKEN` in Operator access. [Exact environment/port guidance](setup.md).

## Unverified and limited

No live real-provider or Azure calls without credentials; no hosted CI run. Demo scores are not LLM accuracy. Small synthetic evaluation set, serial evaluation jobs, local token access, no customer delivery, no production tenancy/authentication/deployment. Long running inference may be interrupted by external container shutdown deadlines; durable leases/outbox recover work. Broker archives remain after replay as historical records. No production-security or exactly-once claim is made.

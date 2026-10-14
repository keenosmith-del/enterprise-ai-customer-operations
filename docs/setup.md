# Local setup

Requirements: Node.js 24 LTS, npm, Docker Desktop with a working engine. The project uses npm workspaces and committed Prisma SQL migrations. No cloud credentials are needed in demo mode.

## Fresh clone: full containers

From the repository root:

```sh
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# Change ADMIN_TOKEN in backend/.env before sharing the workspace.
docker compose up -d --build
```

Compose builds the shared backend image, waits for PostgreSQL health, runs `prisma migrate deploy` and idempotent seed in the migration service, then starts independent API/worker plus Vite frontend. The seed creates eight explicitly synthetic cases with actual processing jobs. Follow `docker compose logs -f api worker` for structured logs. Inspect `docker compose ps` for readiness.

Open http://localhost:5173. Choose **Operator access** in the sidebar and enter `ADMIN_TOKEN` from `backend/.env`. This token is never bundled into frontend code; it is stored only in browser session storage. It is a local single-operator restriction, not production identity management.

Default ports: frontend 5173, API 5050, PostgreSQL 5432, AMQP 5672, RabbitMQ management 15672. All published ports bind loopback. Management login uses the local Compose defaults `operations` / `operations_local`; these are disposable example credentials.

Stop this project's containers with `docker compose down`; data volumes persist. `docker compose down -v` deletes this project's data and should only be used deliberately.

## Local source development

```sh
npm ci
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
npm exec -w backend -- prisma generate
docker compose up -d postgres rabbitmq
npm run db:migrate
npm run db:seed
```

Use three terminals at the repository root:

```sh
npm run dev -w backend
npm run worker -w backend
npm run dev -w frontend
```

`npm run build` compiles both applications. Compiled backend entry points: `npm start -w backend`, `npm run start:worker -w backend`. New schema changes require a new migration (`npm exec -w backend -- prisma migrate dev --name descriptive_change` against a disposable development database), never replace migration history with db push.

## Environment

`backend/.env.example` is authoritative for backend variables:

| Variable                                               | Purpose                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| NODE_ENV                                               | development/test/production; production disables simulation                          |
| PORT                                                   | API process port, default 5050; Compose fixes internal port 5050                     |
| DATABASE_URL                                           | PostgreSQL URL; Compose overrides hostname to postgres                               |
| RABBITMQ_URL                                           | AMQP URL; Compose overrides hostname to rabbitmq                                     |
| RABBITMQ_QUEUE_PREFIX                                  | Queue/exchange namespace (operations default; operations-test for integration tests) |
| MESSAGING_PROVIDER                                     | rabbitmq (default) or azure                                                          |
| AZURE_SERVICE_BUS_CONNECTION_STRING / QUEUE            | Optional provisioned namespace and queue                                             |
| LLM_PROVIDER                                           | demo (default) or openai                                                             |
| LLM_BASE_URL / API_KEY / MODEL                         | Compatible provider base URL, private key, model                                     |
| LLM_TIMEOUT_MS                                         | Per-request timeout, 30,000 default, ≤60,000                                         |
| LLM_INPUT_PRICE_PER_MILLION / OUTPUT_PRICE_PER_MILLION | Optional nonnegative prices, needed with actual usage for cost                       |
| CORS_ORIGIN                                            | Exact browser origin, default http://localhost:5173                                  |
| ADMIN_TOKEN                                            | Required ≥16-character operator access secret                                        |
| QUALITY_GATE_ACCURACY / SCHEMA                         | Real-provider activation thresholds (.8 / .95)                                       |
| MAX_ATTEMPTS / RETRY_BASE_MS                           | Bounded job retry policy (3 / 2,000)                                                 |

`frontend/.env.example`: `VITE_API_URL=http://localhost:5050/api`. Never add provider/admin secrets to a `VITE_` environment variable.

Optional root `.env` Compose variables: `POSTGRES_PORT`, `API_PORT`, `FRONTEND_PORT` override **host** ports; `POSTGRES_USER`, `POSTGRES_PASSWORD`, `RABBITMQ_USER`, `RABBITMQ_PASSWORD` override local service credentials. Match source-development backend URLs to those values. Compose internal ports remain standard.

## Verification-session port conflicts

Other existing projects occupy 5432, 5050 and 5173 on this Mac. This session uses ignored local configuration: root `.env` has PostgreSQL 55432, API 55050, frontend 55173; backend `.env` matches DB/API/CORS; frontend `.env` points to 55050. The committed examples retain the requested defaults. Open http://localhost:55173 for the current session. To return to defaults, first ensure they are free and replace these ignored files with the examples; no other project's services need to be stopped by this application.

### Switch the current running session to source development

Stop only this project's application containers; leave its database and broker running:

```sh
docker compose stop api worker frontend
```

Then use three terminals (current ignored backend/frontend environment files already point to the isolated ports):

```sh
npm run dev -w backend
npm run worker -w backend
npm run dev -w frontend -- --port 55173
```

The frontend CLI port override is required in this session because Vite's committed default remains 5173. Do not run source services concurrently with containers binding the same host ports. Return to full-container mode with `docker compose up -d` after stopping source processes.

## Provider modes

For a compatible service (including Groq), set `LLM_PROVIDER=openai`, `LLM_BASE_URL` to that service's API base ending before `/chat/completions`, `LLM_API_KEY` and a valid `LLM_MODEL`. The endpoint must support `response_format: {type: "json_object"}`. Restart API and worker together to prevent evaluation provider drift. No automatic demo fallback occurs on provider failures.

For Azure set `MESSAGING_PROVIDER=azure`, connection string and queue name. Provision the queue and `<queue>-failed`. Configure peek-lock and sufficient native max delivery count; avoid duplicate detection suppressing intentional replay publications. Live Azure requires actual cloud access and is not proved by mocks.

## Troubleshooting

- Docker socket unavailable: start/check Docker Desktop; `docker version` must show a Server section.
- Port already allocated: use host overrides above and matching source-development URLs. Do not alter another project's containers.
- API 401: enter the backend operator token in the frontend access panel.
- Database relation missing: run migrate deploy, then seed. Do not use db push.
- Cases stay New: inspect worker logs, broker/heartbeat/outbox on Operations and RabbitMQ management. Start the independent worker.
- Published prompts reject edits: duplicate into a draft; evaluation also freezes content.
- Activation 409: inspect the quality gate warning; use a passing real-provider evaluation or an explicit audited override for a local experiment.
- Broker restarted: worker reconnects, outbox resumes; unconfirmed sends may duplicate, committed results do not.

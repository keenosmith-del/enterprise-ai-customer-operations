# Development log

## 2026-10-14 — Foundation and domain implementation (in progress)

Objective: turn the documentation-only repository into a working API/worker and React application.

- Inspected the initial README, filesystem, Node 24.21.0 and npm 11.19.0. No applicable AGENTS.md exists in this repository.
- Created the workspace package configuration and TypeScript configurations. Chose a single backend codebase with independent API and worker entry points, and feature-oriented service modules rather than microservices.
- Added Prisma relational models for cases, reviews, processing jobs/attempts, outbox records, prompts/activation audit, evaluation datasets/results and worker heartbeat. Migration generation is pending dependency installation.
- Implemented service-boundary validation, case creation with atomic job/outbox insertion, persistent human review with optimistic concurrency, prompt drafts/version activation, and asynchronous evaluation creation. HTTP routes are not yet wired.
- Implemented provider contracts, deterministic simulation, configurable Fetch-based chat completions, strict schemas, routing safeguards and scoring mathematics.
- Implemented RabbitMQ confirms/manual settlement and Azure peek-lock/manual settlement adapters. Contract tests and live execution are still pending.
- Dependencies: Express/Zod/Prisma for HTTP and persistence, amqplib for RabbitMQ, Azure supported SDK for optional messaging, React/Vite/Tailwind/Router/Lucide for the interface, Vitest and Testing Library for tests.
- Environment examples now cover API/database/broker/provider, operator token, quality gate and retry settings. No secrets were added.
- Validation so far: repository inspection only. npm registry DNS failed in the sandbox; dependency installation is retrying with network permission. Docker CLI exists, but its daemon is unavailable. Attempting to open Docker Desktop returned macOS `kLSNoExecutableErr`.
- No builds/tests or live database/broker workflows have passed yet. Next: complete worker reliability, HTTP routes, migration/seed, infrastructure and interface; then execute tests and update this record with actual results.

The mandatory architecture/documentation amendment was received during this phase. This entry records work already performed; subsequent phases will update documentation as functionality is added.

## 2026-10-14 — API, worker reliability and connected interface (in progress)

- Wired thin Express routers for cases, prompts, evaluations and operations. Added request IDs/logging, Helmet, restricted CORS, body limits, operator-token access and bounded write rate limits.
- Added outbox publisher confirms, durable retry scheduling, job leases/renewal, expired-lease recovery, duplicate completion guards and failed-job replay. Separate worker entry point reconnects infrastructure; each evaluation example persists uniquely for resumable runs.
- Added repeatable seed: initial two prompt kinds, 36 independent expected labels, eight synthetic cases queued through actual outbox. Added Dockerfiles and Compose for PostgreSQL, RabbitMQ, migration/seed, API, worker and frontend; images have not yet been built.
- Added React pages using Fetch and a polling resource hook: overview, case filters/details/review, version editor/comparison/activation, evaluation progress/results/comparison and operations/failure controls. Styling follows cream/charcoal, restrained cards and responsive sidebar.
- npm installation succeeded after network escalation. Audit initially reported seven advisories; updated Vitest to 5 and selected Prisma 6.12 to avoid affected CLI transitive dependencies. Latest install reports **zero vulnerabilities**.
- Initial typecheck exposed Azure SDK option mismatches and an ungenerated workspace Prisma client. Fixes/client generation are in progress; no passing full build has been recorded yet.
- Documentation now tracks actual API contracts, AI/scoring and messaging decisions. Live Docker/PostgreSQL/RabbitMQ verification remains blocked by the unavailable local daemon.
- Next: complete client/migration generation, fix type checks, execute unit/contract/frontend/integration tests, inspect the UI and finalize setup/verification docs.

## 2026-10-14 — Real infrastructure and business workflow verification

- Docker CLI successfully reached the engine after the initial GUI launch failure; PostgreSQL and RabbitMQ containers were started. Discovered an unrelated project already on PostgreSQL 5432, API 5050 and frontend 5173. Left those services untouched and configured ignored session files for 55432/55050/55173; committed defaults remain 5432/5050/5173.
- Generated and deployed `202610140001_initial`. Seed ran successfully. First integration suite: **8/8 passed** against real PostgreSQL/RabbitMQ in about 12 seconds, including duplicate deliveries, atomic outbox, review transitions, evaluation/version activation, transient/permanent failure, DLQ/replay and expired-worker recovery.
- Built all Docker images and launched full Compose successfully. Health endpoint confirmed API/database/RabbitMQ/independent worker healthy. Application uses the deterministic provider; no real LLM or Azure connection has been verified.
- Added/deployed `202610140002_prompt_integrity`: prompt foreign keys, replay lineage and one-successor uniqueness, one active version per template (partial index), valid job target and state checks. Preserved first migration history.
- Refined prompt save to select its new draft; response prompts now expose their associated evaluation history. Added graceful consumer stop/drain before transport closure, corrected attempt duration measurement to start timestamps, and verified Azure namespace access via SDK peek in adapter initialization.
- Added configurable RabbitMQ queue prefix and dedicated operations-test queues; created a separate test database for the final regression suite.
- Reformatted all TypeScript/TSX/CSS source for readability. Strengthened real-provider policy as a system message with separate untrusted JSON in a user message. A test caught an incomplete refactor that omitted first-call context; corrected it before proceeding. Added modal keyboard focus handling.
- Browser verification: created a customer case from the actual React form, observed New → Processed with captured prompt versions and timeline, edited/approved its draft, resolved it, refreshed and confirmed persisted resolution and human audit. Inspected desktop overview, mobile 390px case detail/navigation and tablet 820px Prompt Studio. Screenshots showed readable responsive layouts.
- Backend unit/adapter tests **16 passed**, frontend **5 passed** after refinements. Typecheck/lint/build pass. Final isolated integration run/rebuilt Compose are being checked before recording final results.

## 2026-10-14 — Final policy, verification and handover

- Browser Prompt Studio saved/selected version 3, queued and completed a real 36-example evaluation, displayed actual attributed simulation metrics, opened comparison, and persisted an explicit demo-only activation override in the audit.
- Found explicit immediate-safety language could remain Medium in the deterministic rules. Added backend-enforced Critical/human review for immediate safety, security and widespread outages, including safety routing to Escalations. Added a regression test. Demo classification still has an independently labelled security-category mismatch; demo scores remain simulation evidence only.
- Final test results: **17 backend unit/contract + 5 frontend + 8 real integration tests passed**. Final typecheck, lint, backend build and frontend production build passed. Isolated integration run completed in about 12 seconds after the final policy correction.
- Final Compose rebuild/start succeeded. Worker has a two-minute container stop grace period; database leases recover any externally interrupted long-running evaluation. Added meaningful comparison labels and hid offscreen mobile navigation from keyboard/accessibility traversal.
- Test scripts explicitly select demo/RabbitMQ and isolated test queues, preventing a configured real AI provider from making paid calls during tests.
- README, architecture/decisions, API, messaging, AI/LLMOps, setup, testing and full Version 1 report now describe the implemented system and actual verification. Saved browser evidence under docs/screenshots.
- Remaining limitations: live OpenAI-compatible provider and live Azure untested without credentials; hosted Actions not run; local operator token needs production identity/tenant security; Azure depth unavailable; serial evaluation and small synthetic dataset. Defaults are documented; ignored session port overrides avoid another local project.
- No Git staging/commit/push/merge/history changes were made. No other repository was modified.

Final review correction: approving an unchanged classification previously recalculated routing from category, which could discard an AI policy escalation. The case review service now preserves the existing team when category is unchanged; an explicit category correction still applies that category's routing. Added a real integration regression test; final integration total is **9 passed**. Browser confirmed a subsequent safety case captured active classification v3, Critical priority, Escalations team and Review state. This is application/pipeline evidence with simulated inference, not a real-provider benchmark.

Final HTTP check: malformed JSON returns structured 400 and oversized bodies return structured 413; added both assertions to the API integration test. Typecheck/lint/backend build and all **9 integration tests** passed after this correction. Operations browser page displayed live healthy API/PostgreSQL/RabbitMQ/worker, zero queued/outbox pending, and the preserved failure/replay history. Current Docker stack remains running on the isolated host ports.

Screenshot QA exposed retained scroll position on route changes. Added pathname-based scroll restoration, reran frontend tests/build/lint successfully, and updated the frontend container. Setup now includes exact commands to switch the current isolated-port session from containers to source development, including Vite's `--port 55173` override.

The final browser reload caught a React Strict Mode cleanup error from an expression-bodied scroll effect: the automated browser wrapped window.scrollTo with a Promise result, which React treated as cleanup. Changed the effect to a block that returns nothing and added a full-app Strict Mode regression covering wrapped scroll and API failure while preserving navigation. Frontend test total is now **6 passed**; final overall test total is **32** (17 backend, 6 frontend, 9 real integration). The full-app regression passed; an initial build caught an unsupported Testing Library exact option, which was removed before rerunning the build. Rebuilt the container for the corrected effect; final overview verification follows.

Handover verification: the corrected full app loaded successfully in the actual browser, showed backend-derived overview data and the active-v3 safety case, and the final screenshot was saved. Both workspace typechecks, all **6 frontend tests**, frontend production build and lint passed after removing the test-only option mismatch. Backend build and **17 unit/contract + 9 real integration tests** remain verified from the final backend revision. No required work remains in the local demo implementation; external-provider/cloud/hosted-CI limits are recorded above.

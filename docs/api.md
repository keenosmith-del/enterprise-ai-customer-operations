# REST API

Base URL `http://localhost:5050/api`. JSON requests/responses, 64 KB request limit. IDs are UUIDs. All errors use `{ "error": { "message": "…", "correlationId": "…" } }` except middleware rate-limit responses. Invalid fields/JSON → 400; oversized body → 413; missing operator token → 401; missing resource → 404; invalid state/concurrent update → 409; unavailable database → health 503/other routes 500. Correlation ID returned in `X-Correlation-ID`.

Writes and all `/operations` routes require `X-Operator-Token: <ADMIN_TOKEN>`. Reads are open in this local demo, so production needs authentication/authorization. CORS permits only `CORS_ORIGIN`. Limits: 300 API requests/minute/IP, 30 writes/minute/IP.

## Cases

| Method | Path                   | Contract                                                                                                                               |
| ------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/cases`               | search≤200 chars; optional status/category/priority, sort=newest/oldest/updated; page≥1, pageSize 1–100. `{items,total,page,pageSize}` |
| POST   | `/cases`               | 201; `{customerName,customerEmail,subject,description,source?}`; atomic case/job/outbox                                                |
| GET    | `/cases/:id`           | Case plus events/reviews/jobs/attempts and exact prompt versions                                                                       |
| POST   | `/cases/:id/reviews`   | `{action,category,priority,response,operator,updatedAt}`; returns updated case                                                         |
| POST   | `/cases/:id/reprocess` | 202; empty body; captures active prompts, returns new job                                                                              |

Name 2–120 chars, valid email≤254, subject 4–200, description 10–15,000, source 1–80 (default Web). Reviews require existing completed recommendation; action=accept/correct/approve/resolve. Category and priority must match configured enums; response 1–10,000; operator 2–100; updatedAt must match current ISO timestamp. Resolution requires Approved state. Resolved/in-flight cases cannot reprocess. Human writes preserve audit records; no customer message is sent.

```sh
curl http://localhost:5050/api/cases \
  -H 'Content-Type: application/json' -H "X-Operator-Token: $ADMIN_TOKEN" \
  -d '{"customerName":"Alex Morgan","customerEmail":"alex@example.test","subject":"Duplicate invoice","description":"I was charged twice for my latest invoice."}'
```

The 201 response contains a persistent case with status New and UUID; inference is asynchronous.

## Prompts

| Method | Path                             | Contract                                                                    |
| ------ | -------------------------------- | --------------------------------------------------------------------------- |
| GET    | `/prompts`                       | Templates with versions, recent runs and activation audit                   |
| POST   | `/prompts/:templateId/versions`  | 201; `{content}`; sequential version under template lock                    |
| PATCH  | `/prompts/versions/:id`          | `{content}`; drafts only, published/evaluated content immutable             |
| POST   | `/prompts/versions/:id/activate` | `{operator,overrideReason?}`; explicit ≥10-character override if gate unmet |

Templates require 80–20,000 characters, `{{case}}`, and `{{classification}}` for response templates. Unknown variables rejected. Quality gate requires real-provider classification/schema scores; initial seed activation is explicitly unvalidated.

## Evaluations

| Method | Path                                                | Contract                                                        |
| ------ | --------------------------------------------------- | --------------------------------------------------------------- |
| GET    | `/evaluations`                                      | Latest 100 runs, dataset/prompt and result count                |
| GET    | `/evaluations/datasets`                             | Datasets and example counts                                     |
| POST   | `/evaluations`                                      | 202; `{datasetId,promptId,responsePromptId?}`; queues run       |
| GET    | `/evaluations/:id`                                  | Run with example outcomes, metrics, attempts and progress count |
| GET    | `/evaluations/compare?baseline=UUID&candidate=UUID` | Completed runs on same dataset, deltas and regressions          |

`promptId` is a classification version. Response version defaults to active if omitted. All selected versions are frozen against later editing after use. Failed inference produces an example-level error and is included in scoring denominators.

## Health, dashboard and operations

| Method | Path                          | Contract                                                                            |
| ------ | ----------------------------- | ----------------------------------------------------------------------------------- |
| GET    | `/health`                     | API/database/broker/worker/provider status; database outage → 503                   |
| GET    | `/dashboard`                  | Case state counts, recent cases/events/failures, actual latency and evaluations     |
| GET    | `/metrics`                    | Operator-protected plain-text job counts for Prometheus-compatible collection       |
| GET    | `/operations`                 | Operator-protected health, latest 100 jobs/attempts, outbox status and retry policy |
| POST   | `/operations/jobs/:id/replay` | 202; empty body; failed-only, new job, one successor per failed job                 |
| POST   | `/operations/simulate`        | 202; `{caseId,mode:"transient"                                                      | "permanent"}`; development/test only |

Infrastructure counts that cannot be retrieved remain null. Azure queue depth is unavailable. Failed replay preserves original attempts/results; evaluation resumes existing unique examples, case replay does not duplicate committed successful jobs.

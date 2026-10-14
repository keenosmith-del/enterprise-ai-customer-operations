# AI and LLMOps

`backend/src/ai/providers.ts` defines one provider interface and two implementations. `LLM_PROVIDER=demo` uses deterministic keyword rules (`deterministic-demo-v1`). It is a simulation, makes no external requests, reports no tokens/cost, and cannot validate real LLM quality. A response prompt containing “brief” changes its demo draft length; it otherwise does not interpret natural-language prompt changes.

`LLM_PROVIDER=openai` uses Fetch at `${LLM_BASE_URL}/chat/completions`, with `LLM_API_KEY` and `LLM_MODEL`. It makes a classification call, validates strict JSON with Zod, enforces business routing, then makes a response recommendation call. Failures/timeouts/429s are explicit; the job retry policy handles bounded recovery. There is no silent fallback to simulated output.

The default templates live in `ai/schema.ts` and are persisted by the seed script. Required variables: `{{case}}`, plus `{{classification}}` for response prompts. Unknown variables prevent saving/activation. Versioned policy text is placed in a system message, while customer input/classification are serialized separately as untrusted JSON in a user message, with instructions to disregard embedded commands. Routing is enforced after inference, and security, Critical and Complaint cases require review. These safeguards reduce risk; they do not prove injection immunity. Drafts are never sent to customers.

Allowed categories: Billing, Technical Support, Account Management, Product Enquiry, Complaint, General Enquiry. Teams respectively: Finance, Technical Support, Customer Success, Sales, Escalations, Customer Service. Security and explicit immediate safety concerns override routing to Escalations. Security, immediate safety and widespread outage signals enforce Critical priority and human review even if a model suggests lower urgency. Priorities: informational=Low, routine support=Medium, customer service unavailable/disputed charge/serious complaint=High, broad outage/compromise/immediate safety=Critical.

Versions progress from draft → evaluation → activation. Evaluated/published content is immutable; duplicate it to make changes. Runtime jobs snapshot version IDs at enqueue time. The quality gate requires a completed **real-provider** run meeting `QUALITY_GATE_ACCURACY` and `QUALITY_GATE_SCHEMA`; otherwise an explicit operator override reason is required and audited. Demo scores never satisfy the gate.

`evaluation/scoring.ts` computes category accuracy and priority accuracy over all examples (failures included), schema compliance, mean attempted inference latency, and failure count. For each category: precision=TP/(TP+FP), recall=TP/(TP+FN), F1=2PR/(P+R), with zero for zero denominators. Macro-F1 averages all six configured categories. Tokens aggregate only when every result has reported usage. Cost aggregates only with reported usage and nonnegative configured per-million input/output pricing. Missing measurements remain null.

Regression comparisons require two completed runs on the same dataset. Changes include accuracy, priority, macro-F1, compliance and latency, with example-level loss of previously correct classifications/priorities/schema validity. Cross-provider comparisons are attributable but are not controlled scientific experiments.

Live external-provider verification requires credentials and is not yet performed.

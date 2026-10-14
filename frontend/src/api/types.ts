export const categories = [
  "Billing",
  "Technical Support",
  "Account Management",
  "Product Enquiry",
  "Complaint",
  "General Enquiry",
];
export const priorities = ["Low", "Medium", "High", "Critical"];
export type CustomerCase = {
  id: string;
  customerName: string;
  customerEmail: string;
  subject: string;
  description: string;
  source: string;
  synthetic: boolean;
  status: string;
  category: string | null;
  priority: string | null;
  team: string | null;
  summary: string | null;
  response: string | null;
  reviewRequired: boolean;
  reviewReason: string | null;
  createdAt: string;
  updatedAt: string;
};
export type CaseEvent = {
  id: string;
  type: string;
  message: string;
  createdAt: string;
  case?: { subject: string };
};
export type Attempt = {
  id: string;
  number: number;
  worker: string;
  status: string;
  error: string | null;
  errorCategory: string | null;
  durationMs: number | null;
  startedAt: string;
};
export type Job = {
  id: string;
  kind: string;
  caseId: string | null;
  evaluationId: string | null;
  state: string;
  attempt: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  classificationPromptId: string;
  responsePromptId: string;
  correlationId: string;
  replayOf: string | null;
  result: {
    provider?: string;
    model?: string;
    simulated?: boolean;
    latencyMs?: number;
  } | null;
  attempts: Attempt[];
  case?: { subject: string };
};
export type Metrics = {
  count: number;
  classificationAccuracy: number;
  priorityAccuracy: number;
  macroF1: number;
  schemaCompliance: number;
  meanLatencyMs: number;
  failedCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCost: number | null;
  perClass: {
    category: string;
    precision: number;
    recall: number;
    f1: number;
    support: number;
  }[];
};
export type PromptVersion = {
  id: string;
  templateId: string;
  version: number;
  content: string;
  active: boolean;
  publishedAt: string | null;
  activationOverride: string | null;
  createdAt: string;
  runs: EvaluationRun[];
  activations: {
    id: string;
    operator: string;
    overrideReason: string | null;
    createdAt: string;
  }[];
  template?: { kind: string; name: string };
};
export type PromptTemplate = {
  id: string;
  name: string;
  purpose: string;
  kind: string;
  versions: PromptVersion[];
};
export type Dataset = {
  id: string;
  name: string;
  description: string;
  _count: { examples: number };
};
export type Result = {
  id: string;
  exampleId: string;
  schemaValid: boolean;
  categoryCorrect: boolean;
  priorityCorrect: boolean;
  latencyMs: number;
  error: string | null;
  output: {
    category: string;
    priority: string;
    summary: string;
    response: string;
  } | null;
  example: {
    key: string;
    subject: string;
    description: string;
    expectedCategory: string;
    expectedPriority: string;
  };
};
export type EvaluationRun = {
  id: string;
  promptId: string;
  responsePromptId: string;
  datasetId: string;
  status: string;
  provider: string;
  model: string;
  simulated: boolean;
  metrics: Metrics | null;
  createdAt: string;
  completedAt: string | null;
  prompt: PromptVersion;
  dataset: Dataset;
  _count?: { results: number };
  results?: Result[];
  jobs?: Job[];
};
export type Health = {
  api: boolean;
  database: boolean;
  messaging: {
    connected: boolean;
    queued: number | null;
    deadLettered: number | null;
  };
  messagingProvider: string;
  workerHealthy: boolean;
  workers: { name: string; lastSeen: string }[];
  provider: { name: string; model: string; simulated: boolean };
};
export type Dashboard = {
  total: number;
  counts: Record<string, number>;
  failedJobs: number;
  averageProcessingLatencyMs: number | null;
  provider: Health["provider"];
  classificationAccuracy: number | null;
  accuracySimulated: boolean | null;
  recentCases: CustomerCase[];
  events: CaseEvent[];
  failures: Attempt[];
  prompts: PromptVersion[];
  evaluations: EvaluationRun[];
};
export type Operations = {
  health: Health;
  counts: Record<string, number>;
  jobs: Job[];
  events: CaseEvent[];
  outboxPending: number;
  outboxErrors: {
    id: string;
    jobId: string;
    error: string;
    attempts: number;
  }[];
  simulationEnabled: boolean;
  retryPolicy: { maxAttempts: number; baseMs: number };
};

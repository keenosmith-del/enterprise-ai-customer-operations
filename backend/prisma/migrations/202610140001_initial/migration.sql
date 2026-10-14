-- CreateTable
CREATE TABLE "CustomerCase" (
    "id" UUID NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'Web',
    "synthetic" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'New',
    "category" TEXT,
    "priority" TEXT,
    "team" TEXT,
    "summary" TEXT,
    "response" TEXT,
    "reviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "reviewReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseEvent" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseReview" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "operator" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptTemplate" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "kind" TEXT NOT NULL,

    CONSTRAINT "PromptTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptVersion" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "activationOverride" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptActivation" (
    "id" UUID NOT NULL,
    "promptId" UUID NOT NULL,
    "operator" TEXT NOT NULL,
    "overrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptActivation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationDataset" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "EvaluationDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationExample" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "expectedCategory" TEXT NOT NULL,
    "expectedPriority" TEXT NOT NULL,

    CONSTRAINT "EvaluationExample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationRun" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "promptId" UUID NOT NULL,
    "responsePromptId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Queued',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "simulated" BOOLEAN NOT NULL,
    "metrics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "EvaluationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationResult" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "exampleId" UUID NOT NULL,
    "output" JSONB,
    "schemaValid" BOOLEAN NOT NULL,
    "categoryCorrect" BOOLEAN NOT NULL,
    "priorityCorrect" BOOLEAN NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cost" DOUBLE PRECISION,
    "error" TEXT,

    CONSTRAINT "EvaluationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingJob" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "caseId" UUID,
    "evaluationId" UUID,
    "classificationPromptId" UUID NOT NULL,
    "responsePromptId" UUID NOT NULL,
    "correlationId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'Queued',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "simulation" TEXT,
    "replayOf" UUID,
    "leaseUntil" TIMESTAMP(3),
    "leaseOwner" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingAttempt" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "worker" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "errorCategory" TEXT,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ProcessingAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "destination" TEXT NOT NULL DEFAULT 'work',
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "name" TEXT NOT NULL,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" TEXT NOT NULL,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "CustomerCase_status_createdAt_idx" ON "CustomerCase"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerCase_category_priority_idx" ON "CustomerCase"("category", "priority");

-- CreateIndex
CREATE INDEX "CaseEvent_caseId_createdAt_idx" ON "CaseEvent"("caseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromptTemplate_name_key" ON "PromptTemplate"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PromptTemplate_kind_key" ON "PromptTemplate"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "PromptVersion_templateId_version_key" ON "PromptVersion"("templateId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationDataset_name_key" ON "EvaluationDataset"("name");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationExample_datasetId_key_key" ON "EvaluationExample"("datasetId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationResult_runId_exampleId_key" ON "EvaluationResult"("runId", "exampleId");

-- CreateIndex
CREATE INDEX "ProcessingJob_state_leaseUntil_idx" ON "ProcessingJob"("state", "leaseUntil");

-- CreateIndex
CREATE INDEX "ProcessingJob_caseId_idx" ON "ProcessingJob"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessingAttempt_jobId_number_key" ON "ProcessingAttempt"("jobId", "number");

-- CreateIndex
CREATE INDEX "OutboxEvent_publishedAt_availableAt_idx" ON "OutboxEvent"("publishedAt", "availableAt");

-- AddForeignKey
ALTER TABLE "CaseEvent" ADD CONSTRAINT "CaseEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CustomerCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseReview" ADD CONSTRAINT "CaseReview_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CustomerCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptVersion" ADD CONSTRAINT "PromptVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PromptTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptActivation" ADD CONSTRAINT "PromptActivation_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "PromptVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationExample" ADD CONSTRAINT "EvaluationExample_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "EvaluationDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationRun" ADD CONSTRAINT "EvaluationRun_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "EvaluationDataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationRun" ADD CONSTRAINT "EvaluationRun_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "PromptVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationResult" ADD CONSTRAINT "EvaluationResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "EvaluationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationResult" ADD CONSTRAINT "EvaluationResult_exampleId_fkey" FOREIGN KEY ("exampleId") REFERENCES "EvaluationExample"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CustomerCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "EvaluationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingAttempt" ADD CONSTRAINT "ProcessingAttempt_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ProcessingJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ProcessingJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


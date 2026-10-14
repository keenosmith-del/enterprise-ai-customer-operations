-- CreateIndex
CREATE UNIQUE INDEX "ProcessingJob_replayOf_key" ON "ProcessingJob"("replayOf");

-- AddForeignKey
ALTER TABLE "EvaluationRun" ADD CONSTRAINT "EvaluationRun_responsePromptId_fkey" FOREIGN KEY ("responsePromptId") REFERENCES "PromptVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_classificationPromptId_fkey" FOREIGN KEY ("classificationPromptId") REFERENCES "PromptVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_responsePromptId_fkey" FOREIGN KEY ("responsePromptId") REFERENCES "PromptVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_replayOf_fkey" FOREIGN KEY ("replayOf") REFERENCES "ProcessingJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A template can have only one active version, including concurrent writers.
CREATE UNIQUE INDEX "PromptVersion_one_active_per_template" ON "PromptVersion" ("templateId") WHERE "active" = true;
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_target_matches_kind" CHECK (
  ("kind" = 'case' AND "caseId" IS NOT NULL AND "evaluationId" IS NULL) OR
  ("kind" = 'evaluation' AND "evaluationId" IS NOT NULL AND "caseId" IS NULL)
);
ALTER TABLE "CustomerCase" ADD CONSTRAINT "CustomerCase_valid_status" CHECK ("status" IN ('New','Processing','Review','Processed','Approved','Resolved','Failed'));
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_valid_state" CHECK ("state" IN ('Queued','Retrying','Processing','Succeeded','Failed'));

import { Router } from "express";
import { z } from "zod";
import { operations } from "../services/operations.js";
import { replayJob } from "../services/jobs.js";
import { reprocessCase } from "../services/cases.js";
import { requireOperator } from "../middleware/security.js";
import { HttpError } from "../middleware/errors.js";
import { config } from "../config.js";
export const operationsRouter = Router();
operationsRouter.use(requireOperator);
operationsRouter.get("/", async (_req, res) => res.json(await operations()));
operationsRouter.post("/jobs/:id/replay", async (req, res) =>
  res
    .status(202)
    .json(
      await replayJob(
        z.string().uuid().parse(req.params.id),
        res.locals.correlationId,
      ),
    ),
);
operationsRouter.post("/simulate", async (req, res) => {
  if (config.NODE_ENV === "production")
    throw new HttpError(403, "Failure simulation is disabled in production");
  const input = z
    .object({
      caseId: z.string().uuid(),
      mode: z.enum(["transient", "permanent"]),
    })
    .strict()
    .parse(req.body);
  res
    .status(202)
    .json(
      await reprocessCase(input.caseId, res.locals.correlationId, input.mode),
    );
});

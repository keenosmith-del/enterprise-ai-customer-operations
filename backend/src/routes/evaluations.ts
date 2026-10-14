import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import {
  listEvaluations,
  startEvaluation,
  evaluationDetail,
  compareRuns,
} from "../services/evaluations.js";
import { requireOperator } from "../middleware/security.js";
export const evaluationsRouter = Router();
const id = (value: unknown) => z.string().uuid().parse(value);
evaluationsRouter.get("/", async (_req, res) =>
  res.json(await listEvaluations()),
);
evaluationsRouter.get("/datasets", async (_req, res) =>
  res.json(
    await db.evaluationDataset.findMany({
      include: { _count: { select: { examples: true } } },
    }),
  ),
);
evaluationsRouter.get("/compare", async (req, res) =>
  res.json(await compareRuns(id(req.query.baseline), id(req.query.candidate))),
);
evaluationsRouter.post("/", requireOperator, async (req, res) =>
  res
    .status(202)
    .json(await startEvaluation(req.body, res.locals.correlationId)),
);
evaluationsRouter.get("/:id", async (req, res) =>
  res.json(await evaluationDetail(id(req.params.id))),
);

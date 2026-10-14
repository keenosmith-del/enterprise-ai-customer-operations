import { Router } from "express";
import { z } from "zod";
import {
  createCase,
  listCases,
  caseDetail,
  reviewCase,
  reprocessCase,
} from "../services/cases.js";
import { requireOperator } from "../middleware/security.js";
export const casesRouter = Router();
const id = (value: unknown) => z.string().uuid().parse(value);
casesRouter.get("/", async (req, res) => res.json(await listCases(req.query)));
casesRouter.post("/", requireOperator, async (req, res) =>
  res.status(201).json(await createCase(req.body, res.locals.correlationId)),
);
casesRouter.get("/:id", async (req, res) =>
  res.json(await caseDetail(id(req.params.id))),
);
casesRouter.post("/:id/reviews", requireOperator, async (req, res) =>
  res.json(await reviewCase(id(req.params.id), req.body)),
);
casesRouter.post("/:id/reprocess", requireOperator, async (req, res) =>
  res
    .status(202)
    .json(await reprocessCase(id(req.params.id), res.locals.correlationId)),
);

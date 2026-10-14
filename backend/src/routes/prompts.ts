import { Router } from "express";
import { z } from "zod";
import {
  listPrompts,
  newVersion,
  editVersion,
  activateVersion,
} from "../services/prompts.js";
import { requireOperator } from "../middleware/security.js";
export const promptsRouter = Router();
const id = (value: unknown) => z.string().uuid().parse(value);
promptsRouter.get("/", async (_req, res) => res.json(await listPrompts()));
promptsRouter.post("/:id/versions", requireOperator, async (req, res) =>
  res.status(201).json(await newVersion(id(req.params.id), req.body)),
);
promptsRouter.patch("/versions/:id", requireOperator, async (req, res) =>
  res.json(await editVersion(id(req.params.id), req.body)),
);
promptsRouter.post(
  "/versions/:id/activate",
  requireOperator,
  async (req, res) =>
    res.json(await activateVersion(id(req.params.id), req.body)),
);

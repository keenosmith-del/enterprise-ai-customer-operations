import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { casesRouter } from "./routes/cases.js";
import { promptsRouter } from "./routes/prompts.js";
import { evaluationsRouter } from "./routes/evaluations.js";
import { operationsRouter } from "./routes/operations.js";
import { health, dashboard } from "./services/operations.js";
import { errorHandler, HttpError, log } from "./middleware/errors.js";
import { requireOperator } from "./middleware/security.js";
import { db } from "./db.js";
export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: config.CORS_ORIGIN,
    allowedHeaders: ["Content-Type", "X-Operator-Token", "X-Correlation-ID"],
  }),
);
app.use((req, res, next) => {
  const supplied = req.header("X-Correlation-ID");
  res.locals.correlationId =
    supplied && /^[\w-]{1,80}$/.test(supplied) ? supplied : randomUUID();
  res.setHeader("X-Correlation-ID", res.locals.correlationId);
  const start = Date.now();
  res.on("finish", () =>
    log({
      type: "request",
      correlationId: res.locals.correlationId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
    }),
  );
  next();
});
app.use(express.json({ limit: "64kb" }));
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
app.use("/api", (req, res, next) => {
  if (["POST", "PATCH"].includes(req.method))
    return rateLimiter(req, res, next);
  next();
});
const rateLimiter = rateLimit({
  windowMs: 60000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
app.get("/api/health", async (_req, res) => {
  const status = await health();
  res.status(status.database ? 200 : 503).json(status);
});
app.get("/api/dashboard", async (_req, res) => res.json(await dashboard()));
app.get("/api/metrics", requireOperator, async (_req, res) => {
  const counts = await db.processingJob.groupBy({
    by: ["state"],
    _count: true,
  });
  res
    .type("text/plain")
    .send(
      counts
        .map((s) => `operations_jobs{state="${s.state}"} ${s._count}`)
        .join("\n") + "\n",
    );
});
app.use("/api/cases", casesRouter);
app.use("/api/prompts", promptsRouter);
app.use("/api/evaluations", evaluationsRouter);
app.use("/api/operations", operationsRouter);
app.use(() => {
  throw new HttpError(404, "Endpoint not found");
});
app.use(errorHandler);

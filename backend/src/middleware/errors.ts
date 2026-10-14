import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function log(fields: Record<string, unknown>) {
  console.log(JSON.stringify({ time: new Date().toISOString(), ...fields }));
}
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const status =
    error instanceof HttpError
      ? error.status
      : error instanceof Error &&
          "type" in error &&
          error.type === "entity.too.large"
        ? 413
        : error instanceof ZodError ||
            (error instanceof SyntaxError &&
              "status" in error &&
              error.status === 400)
          ? 400
          : error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === "P2002"
            ? 409
            : 500;
  const message =
    error instanceof HttpError
      ? error.message
      : error instanceof ZodError
        ? error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ")
        : status === 413
          ? "Request body exceeds the 64 KB limit"
          : status === 400
            ? "Invalid JSON request body"
            : status === 409
              ? "Concurrent update; refresh and retry"
              : "Request could not be completed";
  log({
    level: "error",
    correlationId: res.locals.correlationId,
    method: req.method,
    path: req.path,
    status,
    errorCategory: error instanceof Error ? error.name : "unknown",
  });
  res
    .status(status)
    .json({ error: { message, correlationId: res.locals.correlationId } });
}

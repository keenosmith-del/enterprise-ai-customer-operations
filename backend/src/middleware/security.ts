import { timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { config } from "../config.js";
import { HttpError } from "./errors.js";
export function requireOperator(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const token = req.header("X-Operator-Token") ?? "";
  const expected = Buffer.from(config.ADMIN_TOKEN),
    actual = Buffer.from(token);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new HttpError(401, "Operator token required for this action");
  next();
}

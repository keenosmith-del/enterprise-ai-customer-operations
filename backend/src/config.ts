import "dotenv/config";
import { z } from "zod";
const env = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().default(5050),
  DATABASE_URL: z.string().min(1),
  RABBITMQ_QUEUE_PREFIX: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/)
    .default("operations"),
  RABBITMQ_URL: z.string().default("amqp://localhost"),
  MESSAGING_PROVIDER: z.enum(["rabbitmq", "azure"]).default("rabbitmq"),
  AZURE_SERVICE_BUS_CONNECTION_STRING: z.string().optional(),
  AZURE_SERVICE_BUS_QUEUE: z.string().default("operations"),
  LLM_PROVIDER: z.enum(["demo", "openai"]).default("demo"),
  LLM_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default("gpt-4.1-mini"),
  LLM_TIMEOUT_MS: z.coerce.number().positive().max(60000).default(30000),
  LLM_INPUT_PRICE_PER_MILLION: z.string().optional(),
  LLM_OUTPUT_PRICE_PER_MILLION: z.string().optional(),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  ADMIN_TOKEN: z.string().min(16),
  QUALITY_GATE_ACCURACY: z.coerce.number().min(0).max(1).default(0.8),
  QUALITY_GATE_SCHEMA: z.coerce.number().min(0).max(1).default(0.95),
  MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
  RETRY_BASE_MS: z.coerce.number().int().min(100).default(2000),
});
export const config = env.parse(process.env);
if (config.LLM_PROVIDER === "openai" && !config.LLM_API_KEY)
  throw new Error("LLM_API_KEY required for openai provider");
if (
  config.MESSAGING_PROVIDER === "azure" &&
  !config.AZURE_SERVICE_BUS_CONNECTION_STRING
)
  throw new Error("Azure connection string required");

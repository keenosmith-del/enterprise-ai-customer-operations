import { app } from "./app.js";
import { config } from "./config.js";
import { db } from "./db.js";
import { closeOperations } from "./services/operations.js";
import { log } from "./middleware/errors.js";
const server = app.listen(config.PORT, "0.0.0.0", () =>
  log({
    type: "api_started",
    port: config.PORT,
    provider: config.LLM_PROVIDER,
  }),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close(() => {
      void Promise.allSettled([closeOperations(), db.$disconnect()]).then(() =>
        process.exit(0),
      );
    });
  });

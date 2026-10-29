import { Elysia } from "elysia";
import { healthRoutes } from "./features/health/health.route";
import { executionRoutes } from "./features/execution/execution.route";
import { ExecutionError } from "./features/engine/engine.error";
import { DomainError } from "./core/error";
import { playgroundCors } from "./core/cors";

export const app = new Elysia({ name: "apimirror-playground" })
  .use(playgroundCors)
  .onError(({ error, code, status }) => {
    if (error instanceof ExecutionError || error instanceof DomainError) {
      return status(error.status, { message: error.message });
    }
    if (code === "UNKNOWN") {
      console.error(error);
      return status(500, { message: "Unable to complete the request." });
    }
  })
  .get("", () => "ApiMirror Playground")
  .use(healthRoutes)
  .use(executionRoutes);

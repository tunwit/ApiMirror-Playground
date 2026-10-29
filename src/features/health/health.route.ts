import { Elysia } from "elysia";

export const healthRoutes = new Elysia({ name: "playground-health" })
  .get("/health", () => ({ status: "ok", service: "playground" }));

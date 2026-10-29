import { Elysia } from "elysia";
import { healthRoutes } from "./features/health/health.route";

export const app = new Elysia({ name: "apimirror-playground" })
  .use(healthRoutes);

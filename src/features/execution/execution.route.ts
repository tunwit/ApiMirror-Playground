import { Elysia } from "elysia";
import { executionController } from "../container";

export const executionRoutes = new Elysia({ name: "playground-mock" }).all(
  "/mock/:projectId/*",
  ({ params, request }) =>
    executionController.execute(
      params.projectId,
      request.headers.get("authorization"),
      // Keep encoded segments intact; the engine decodes captured values once.
      "/" + new URL(request.url).pathname.split("/").slice(3).join("/"),
      request.method,
      request,
    ),
  { parse: "none" },
);

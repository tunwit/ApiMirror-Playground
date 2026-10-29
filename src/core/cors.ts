import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";

export const playgroundCors = new Elysia({ name: "playground-cors" })
  .use(cors({
    origin: "*",
    credentials: false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    exposeHeaders: [],
    // Keep ordinary OPTIONS requests available for user-defined mock routes.
    preflight: false,
  }))
  .onRequest(({ request, set }) => {
    if (request.method === "OPTIONS"
      && request.headers.has("origin")
      && request.headers.has("access-control-request-method")) {
      set.headers["access-control-max-age"] = "600";
      return new Response(null, { status: 204 });
    }
  });

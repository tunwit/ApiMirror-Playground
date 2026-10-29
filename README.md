# Playground

Independent Elysia server for the future mock execution API. It runs on port 3002 by default; the management backend stays on port 3001.

Install dependencies from the repository root with `bun install --frozen-lockfile`, then run `bun run dev:playground`. Alternatively, run `bun run dev` or `bun run start` inside `playground/`.

The app reads `playground/.env` and the root `.env`. Copy `.env.example` to `.env` for local overrides. It uses `DATABASE_URL` when provided, otherwise the root PostgreSQL settings. `PLAYGROUND_PORT` takes precedence over `PORT`, with a default of 3002. No Better Auth secret or backend configuration is required.

`src/app.ts` exports the Elysia instance; `src/index.ts` starts the server and closes its server and database pool on shutdown. `src/features/container.ts` initializes shared dependencies directly, including this process's own connection pool from `@apimirror/database`. Add future feature repositories, services and controllers to this single container. Route files export Elysia instances directly.

`GET /health` returns `{ "status": "ok", "service": "playground" }`. This is a liveness endpoint; it does not check database availability. Unknown routes return 404.

`/mock/:projectId/*` accepts requests for the saved HTTP methods and calls the execution controller and service. Send `Authorization: Bearer <project-token>`. The controller extracts the token, and the engine validates the project UUID, hashes the token with SHA-256 and checks the project/token pair in one query. Malformed project IDs return 400. Missing or invalid tokens and nonexistent projects return the same 401 response. Raw tokens and stored hashes are not returned to callers.

Browser clients may call the playground from any origin using a bearer token and `Content-Type: application/json`. CORS allows all seven supported mock methods. Browser preflight requests (OPTIONS with Origin and Access-Control-Request-Method) return 204 before authentication or database access. Actual requests still require a valid project token, including ordinary OPTIONS mock requests. Cookie credentials are not enabled; browser fetch calls should omit `credentials: "include"`. Success and error responses both carry CORS headers.

After authentication succeeds, the service calls `engine.findRoute(projectId, path, method)`. The engine first tries an exact path, then loads dynamic routes for only that project and method. Query strings are excluded from matching. Unsupported methods or missing routes return 404.

Save `/users/:id` with response body `{ "id": "{{params.id}}", "message": "Hello user {{params.id}}" }`. A request to `/mock/:projectId/users/123` returns `{ "id": "123", "message": "Hello user 123" }` with the saved status. Parameters occupy a full, nonempty path segment; names start with a letter or underscore and contain letters, digits or underscores. Multiple parameters such as `/teams/:teamId/users/:id` are supported. Captured values are URL-decoded once and remain strings. Trailing slashes are significant for dynamic matching.

Exact paths such as `/users/me` take priority. Among dynamic matches, literal segments take priority from left to right; equally specific patterns use alphabetical path order as a deterministic tie-breaker. Avoid storing overlapping patterns such as `/users/:id` and `/users/:name` unless that behavior is intended.

After required-body validation, the engine replaces `{{params.name}}` and `{{body.name}}` in response string values recursively, including strings inside objects and arrays. Body placeholders read own top-level properties from the request's JSON object. For example, a response template `{ "message": "Hello {{body.name}}" }` with request body `{ "name": "Alex" }` returns `{ "message": "Hello Alex" }`. Values are inserted as text; non-string body values use their JSON representation. Object keys and non-string template values remain unchanged. Unknown placeholders are left unchanged. Replacement is a single pass and never evaluates expressions or code; the stored response template is not modified.

A successful lookup validates the request body before returning the saved JSON response body with its configured HTTP status. `HEAD` requests and statuses 204, 205 and 304 return no body. Status codes must be integers from 200 to 599; an existing route with an unsupported status returns a 400 configuration error. The single `features/container.ts` initializes both repositories, the engine, execution service and controller. Run `bun test` inside `playground/` to check authentication, lookup, body validation and response handling without a database.

When `requiredBody` contains field names or the response uses `{{body.name}}` placeholders, the body must be a valid JSON object with all required fields as its own top-level properties. Missing or malformed JSON, arrays, scalars and null bodies return 400. Missing fields return a message such as `Missing required body fields: password.` Extra fields are allowed, and values of null, false, zero or an empty string count as present. Nested objects do not satisfy top-level requirements. With an empty `requiredBody` and no body placeholders, no body is required or parsed. Parsing happens once, only after authentication and route lookup succeed, preserving 401 and 404 responses for those failures.

The backend's `PLAYGROUND_URL` determines the mock base URL returned by project settings. It defaults to `http://localhost:3002`; update it when deploying or changing the playground port.

Run `bun run typecheck` here to check this app, or at the repository root to check all backend workspaces. Database migrations remain managed by the backend commands using `packages/database/drizzle/`.

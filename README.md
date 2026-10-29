# Playground

Independent Elysia server for the future mock execution API. It runs on port 3002 by default; the management backend stays on port 3001.

Install dependencies from the repository root with `bun install --frozen-lockfile`, then run `bun run dev:playground`. Alternatively, run `bun run dev` or `bun run start` inside `playground/`.

The app reads `playground/.env` and the root `.env`. Copy `.env.example` to `.env` for local overrides. It uses `DATABASE_URL` when provided, otherwise the root PostgreSQL settings. `PLAYGROUND_PORT` takes precedence over `PORT`, with a default of 3002. No Better Auth secret or backend configuration is required.

`src/app.ts` exports the Elysia instance; `src/index.ts` starts the server and closes its server and database pool on shutdown. `src/features/container.ts` initializes shared dependencies directly, including this process's own connection pool from `@apimirror/database`. Add future feature repositories, services and controllers to this single container. Route files export Elysia instances directly.

`GET /health` returns `{ "status": "ok", "service": "playground" }`. This is a liveness endpoint; it does not check database availability. Mock execution and project bearer-token authentication are not implemented yet. Unknown routes return 404.

The backend's `PLAYGROUND_URL` determines the mock base URL returned by project settings. It defaults to `http://localhost:3002`; update it when deploying or changing the playground port.

Run `bun run typecheck` here to check this app, or at the repository root to check all backend workspaces. Database migrations remain managed by the backend commands using `packages/database/drizzle/`.

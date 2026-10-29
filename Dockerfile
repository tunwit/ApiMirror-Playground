# syntax=docker/dockerfile:1
FROM oven/bun:1.3.2-slim
WORKDIR /app

# Build from the repository root to resolve the shared workspace package.
COPY package.json bun.lock bunfig.toml ./
COPY backend/package.json ./backend/package.json
COPY playground/package.json ./playground/package.json
COPY packages/database/package.json ./packages/database/package.json
RUN bun install --frozen-lockfile --production --ignore-scripts

COPY packages/database ./packages/database
COPY playground/src ./playground/src

ENV NODE_ENV=production PLAYGROUND_PORT=3002
USER bun
EXPOSE 3002
CMD ["bun", "playground/src/index.ts"]

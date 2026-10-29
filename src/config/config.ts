import { config } from "dotenv";
import { fileURLToPath } from "node:url";

config({
  path: [
    fileURLToPath(new URL("../../.env", import.meta.url)),
    fileURLToPath(new URL("../../../.env", import.meta.url)),
  ],
  quiet: true,
});

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. See playground/.env.example.`);
  return value;
}

function databaseURL(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const user = encodeURIComponent(required("POSTGRES_USER"));
  const password = encodeURIComponent(required("POSTGRES_PASSWORD"));
  const database = encodeURIComponent(required("POSTGRES_DB"));
  const host = process.env.POSTGRES_HOST || "localhost";
  const port = process.env.POSTGRES_PORT || "5432";
  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

export const env = {
  databaseURL: databaseURL(),
  port: Number(process.env.PLAYGROUND_PORT || process.env.PORT || "3002"),
};

if (!Number.isInteger(env.port) || env.port < 1 || env.port > 65535) {
  throw new Error("Playground port must be an integer between 1 and 65535.");
}

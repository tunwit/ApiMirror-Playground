import { app } from "./app";
import { env } from "./config/config";
import { pool } from "./features/container";

app.listen(env.port);

console.log(`ApiMirror playground listening on http://localhost:${env.port}`);

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await app.stop();
  await pool.end();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

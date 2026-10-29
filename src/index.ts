import { app } from "./app";
import { env } from "./config/config";
import { pool } from "./features/container";

app.listen(env.port);

console.log(`ApiMirror playground listening on http://localhost:${env.port}`);

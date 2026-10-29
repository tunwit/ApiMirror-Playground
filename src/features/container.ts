import { createDatabase } from "@apimirror/database";
import { env } from "../config/config";

export const { db, pool } = createDatabase(env.databaseURL);

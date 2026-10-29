import { createDatabase } from "@apimirror/database";
import { env } from "../config/config";
import { ProjectTokensRepo } from "./project-token/project-tokens.repo";
import { Engine } from "./engine/engine";
import { ExecutionService } from "./execution/execution.service";
import { ExecutionController } from "./execution/execution.controller";
import { MockRoutesRepo } from "./mock-routes/mock-routes.repo";

export const { db, pool } = createDatabase(env.databaseURL);

const projectTokensRepo = new ProjectTokensRepo(db);
const mockRoutesRepo = new MockRoutesRepo(db);
const engine = new Engine(projectTokensRepo, mockRoutesRepo);
export const executionService = new ExecutionService(engine);
export const executionController = new ExecutionController(executionService);

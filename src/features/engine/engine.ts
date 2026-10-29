import { createHash } from "node:crypto";
import type { ProjectTokensRepo } from "../project-token/project-tokens.repo";
import { ExecutionError } from "./engine.error";
import { httpMethod } from "@apimirror/database/schema";
import type { MockRoutesRepo } from "../mock-routes/mock-routes.repo";
import { BadRequestError, NotFoundError } from "../../core/error";
import { compareRoutePaths, isDynamicPath, matchRoutePath } from "./route-matcher";
import { resolveResponseBody, usesRequestBody } from "./response-template";
import type { JsonValue } from "@apimirror/database/schema";

export class Engine {
  constructor(
    private readonly tokens: Pick<ProjectTokensRepo, "findProjectByIdAndToken">,
    private readonly routes: Pick<MockRoutesRepo, "findByPathAndMethod" | "findDynamicByMethod">,
  ) {}

  async assertValidateProject(projectId: string, token: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
      throw new ExecutionError(400, "Invalid project ID. Use the project's UUID.");
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const project = await this.tokens.findProjectByIdAndToken(projectId, tokenHash);
    if (!project) throw new ExecutionError(401, "Invalid project or token.");

    return project;
  }

  async findRoute(projectId: string, path: string, method: string) {
    const supportedMethod = httpMethod.enumValues.find((value) => value === method);
    if (!supportedMethod) throw new NotFoundError("Mock route not found.");

    const route = await this.routes.findByPathAndMethod(projectId, path, supportedMethod);
    if (route && !isDynamicPath(route.path)) return { route, params: {} as Record<string, string> };

    const candidates = await this.routes.findDynamicByMethod(projectId, supportedMethod);
    candidates.sort((left, right) => compareRoutePaths(left.path, right.path));
    for (const candidate of candidates) {
      const params = matchRoutePath(candidate.path, path);
      if (params) return { route: candidate, params };
    }
    throw new NotFoundError("Mock route not found.");
  }

  usesRequestBody(body: JsonValue) {
    return usesRequestBody(body);
  }

  resolveResponseBody(body: JsonValue, params: Record<string, string>, requestBody?: unknown) {
    return resolveResponseBody(body, params, requestBody);
  }

  assertRequiredBody(requiredFields: string[], body: unknown) {
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new BadRequestError("Request body must be a JSON object.");
    }

    const missingFields = requiredFields.filter((field) => !Object.hasOwn(body, field));
    if (missingFields.length > 0) {
      throw new BadRequestError(`Missing required body fields: ${missingFields.join(", ")}.`);
    }
  }
}

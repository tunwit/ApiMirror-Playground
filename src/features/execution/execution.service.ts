import type { Engine } from "../engine/engine";
import { BadRequestError } from "../../core/error";

export class ExecutionService {
  constructor(private readonly engine: Engine) {}

  async execute(
    projectId: string,
    token: string,
    path: string,
    method: string,
    readBody: () => Promise<unknown> = async () => undefined,
  ) {
    await this.engine.assertValidateProject(projectId, token);
    const { route, params } = await this.engine.findRoute(projectId, path, method);

    let requestBody: unknown;
    const needsBody = route.requiredBody.length > 0 || this.engine.usesRequestBody(route.responseBody);
    if ((method === "GET" || method === "HEAD") && needsBody) {
      throw new BadRequestError(`${method} routes cannot require body fields or use {{body.name}} placeholders. Update this route's configuration.`);
    }
    if (needsBody) {
      requestBody = await readBody();
      this.engine.assertRequiredBody(route.requiredBody, requestBody);
    }

    return { ...route, responseBody: this.engine.resolveResponseBody(route.responseBody, params, requestBody) };
  }
}

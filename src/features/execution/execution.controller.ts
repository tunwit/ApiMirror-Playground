import { BadRequestError, UnauthorizedError } from "../../core/error";
import { ExecutionService } from "./execution.service";

export class ExecutionController {
  constructor(private readonly service: ExecutionService) {}

  async execute(projectId: string, authorization: string | null, path: string, method: string, request?: Request) {
    const token = /^Bearer\s+(\S+)$/i.exec(authorization?.trim() ?? "")?.[1];
    if (!token) throw new UnauthorizedError("Invalid project or token.");

    const route = await this.service.execute(projectId, token, path, method, async () => {
      if (!request) return undefined;
      try {
        return await request.json();
      } catch (e){
        console.log(e)
        throw new BadRequestError("Request body must be valid JSON.");
      }
    });
    const status = route.statusCode;
    if (!Number.isInteger(status) || status < 200 || status > 599) {
      throw new BadRequestError("Mock route status code must be between 200 and 599.");
    }

    if ([204, 205, 304].includes(status)) {
      return new Response(null, { status });
    }
    if (method === "HEAD") {
      return new Response(null, {
        status,
        headers: { "content-type": "application/json" },
      });
    }

    return Response.json(route.responseBody, { status });
  }
}

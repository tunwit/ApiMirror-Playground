import { describe, expect, mock, test } from "bun:test";
import type { MockRoute } from "@apimirror/database/schema";
import { Engine } from "../src/features/engine/engine";
import { resolveResponseBody } from "../src/features/engine/response-template";
import { ExecutionService } from "../src/features/execution/execution.service";
import { ExecutionController } from "../src/features/execution/execution.controller";

const projectId = "550e8400-e29b-41d4-a716-446655440000";
const route: MockRoute = {
  id: "650e8400-e29b-41d4-a716-446655440000", projectId,
  method: "POST", path: "/users/:id", statusCode: 201,
  responseBody: { message: "Hello {{body.name}}", id: "{{params.id}}" },
  requiredBody: [], createdAt: new Date(), updatedAt: new Date(),
};

function setup(requiredBody: string[] = [], authorized = true, found = true) {
  const engine = new Engine(
    { findProjectByIdAndToken: async () => authorized ? { id: projectId } : undefined },
    {
      findByPathAndMethod: async () => undefined,
      findDynamicByMethod: async () => found ? [{ ...route, requiredBody }] : [],
    },
  );
  const service = new ExecutionService(engine);
  return { service, controller: new ExecutionController(service) };
}

describe("request body placeholders", () => {
  test("rejects legacy GET/HEAD body dependencies without reading the request", async () => {
    const configurations: Pick<MockRoute, "requiredBody" | "responseBody">[] = [
      { requiredBody: ["name"], responseBody: {} },
      { requiredBody: [], responseBody: { message: "{{body.name}}" } },
    ];
    for (const method of ["GET", "HEAD"] as const) {
      for (const configuration of configurations) {
        const savedRoute = { ...route, path: "/users", method, ...configuration };
        const engine = new Engine(
          { findProjectByIdAndToken: async () => ({ id: projectId }) },
          { findByPathAndMethod: async () => savedRoute, findDynamicByMethod: async () => [] },
        );
        const readBody = mock(async () => { throw new Error("Body must not be read"); });
        await expect(new ExecutionService(engine).execute(projectId, "test", "/users", method, readBody))
          .rejects.toMatchObject({ status: 400, message: `${method} routes cannot require body fields or use {{body.name}} placeholders. Update this route's configuration.` });
        expect(readBody).not.toHaveBeenCalled();
      }
    }
  });

  test("renders body and path placeholders without required fields", async () => {
    const request = new Request("http://localhost/users/123", {
      method: "POST", body: JSON.stringify({ name: "Alex" }),
    });
    const response = await setup().controller.execute(projectId, "Bearer test", "/users/123", "POST", request);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ message: "Hello Alex", id: "123" });
    expect(route.responseBody).toEqual({ message: "Hello {{body.name}}", id: "{{params.id}}" });
  });

  test("reads once and validates required fields before rendering", async () => {
    const readBody = mock(async () => ({ name: "Alex" }));
    const result = await setup(["name"]).service.execute(projectId, "test", "/users/123", "POST", readBody);
    expect(result.responseBody).toEqual({ message: "Hello Alex", id: "123" });
    expect(readBody).toHaveBeenCalledTimes(1);
    await expect(setup(["email"]).service.execute(projectId, "test", "/users/123", "POST", readBody))
      .rejects.toMatchObject({ status: 400, message: "Missing required body fields: email." });
  });

  test("rejects malformed or non-object JSON even with no required fields", async () => {
    for (const body of [undefined, "{broken", "null", "[]", "0", '"text"']) {
      const request = new Request("http://localhost/users/123", { method: "POST", body });
      await expect(setup().controller.execute(projectId, "Bearer test", "/users/123", "POST", request))
        .rejects.toMatchObject({ status: 400 });
    }
  });

  test("does not read a body before authentication and lookup succeed", async () => {
    const readBody = mock(async () => { throw new Error("Body must not be read"); });
    await expect(setup([], false).service.execute(projectId, "test", "/users/123", "POST", readBody))
      .rejects.toMatchObject({ status: 401 });
    await expect(setup([], true, false).service.execute(projectId, "test", "/users/123", "POST", readBody))
      .rejects.toMatchObject({ status: 404 });
    expect(readBody).not.toHaveBeenCalled();
  });

  test("renders nested response values and serializes non-string body fields as text", () => {
    const template = { "{{body.name}}": ["{{ body.name }}", { value: "{{body.count}}/{{body.active}}/{{body.empty}}/{{body.blank}}/{{body.object}}" }] };
    expect(resolveResponseBody(template, {}, { name: "Alex", count: 0, active: false, empty: null, blank: "", object: { a: 1 } }))
      .toEqual({ "{{body.name}}": ["Alex", { value: '0/false/null//{"a":1}' }] });
  });

  test("leaves missing, inherited and expression placeholders unchanged", () => {
    const template = "{{body.missing}} {{body.toString}} {{body.name + 1}} {{body.user.name}}";
    expect(resolveResponseBody(template, {}, {})).toBe(template);
    expect(resolveResponseBody("{{body.name}}", {}, Object.create({ name: "inherited" }))).toBe("{{body.name}}");
  });

  test("does not re-expand body values or treat prototype-like names as special", () => {
    const value = '"\\$&{{params.id}} {{body.other}}';
    expect(resolveResponseBody("{{body.name}}", { id: "123" }, { name: value, other: "secret" })).toBe(value);
    expect(resolveResponseBody("{{body.__proto__}}", {}, JSON.parse('{"__proto__":"safe"}'))).toBe("safe");
  });
});

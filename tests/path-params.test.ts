import { describe, expect, mock, test } from "bun:test";
import type { MockRoute } from "@apimirror/database/schema";
import { Engine } from "../src/features/engine/engine";
import { ExecutionService } from "../src/features/execution/execution.service";
import { ExecutionController } from "../src/features/execution/execution.controller";
import { matchRoutePath } from "../src/features/engine/route-matcher";
import { resolveResponseBody } from "../src/features/engine/response-template";

const projectId = "550e8400-e29b-41d4-a716-446655440000";
const route: MockRoute = {
  id: "650e8400-e29b-41d4-a716-446655440000", projectId,
  method: "GET", path: "/users/:id", statusCode: 201,
  responseBody: { id: "{{params.id}}", message: "Hello user {{params.id}}" },
  requiredBody: [], createdAt: new Date(), updatedAt: new Date(),
};

function setup(candidates: MockRoute[] = [route], exact?: MockRoute) {
  const findDynamicByMethod = mock(async () => [...candidates]);
  const engine = new Engine(
    { findProjectByIdAndToken: async () => ({ id: projectId }) },
    { findByPathAndMethod: async () => exact, findDynamicByMethod },
  );
  return { engine, findDynamicByMethod, controller: new ExecutionController(new ExecutionService(engine)) };
}

describe("dynamic mock routes", () => {
  test("captures a parameter and renders the configured status and body", async () => {
    const { controller, findDynamicByMethod } = setup();
    const response = await controller.execute(projectId, "Bearer test", "/users/123", "GET");
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "123", message: "Hello user 123" });
    expect(findDynamicByMethod).toHaveBeenCalledWith(projectId, "GET");
    expect(route.responseBody).toEqual({ id: "{{params.id}}", message: "Hello user {{params.id}}" });
  });

  test("exact paths win without loading dynamic routes", async () => {
    const exact = { ...route, path: "/users/me", responseBody: { exact: true } };
    const { engine, findDynamicByMethod } = setup([route], exact);
    expect((await engine.findRoute(projectId, "/users/me", "GET")).route).toBe(exact);
    expect(findDynamicByMethod).not.toHaveBeenCalled();
  });

  test("prefers literal segments and breaks ambiguous ties deterministically", async () => {
    const broad = { ...route, path: "/:group/:id" };
    const { engine } = setup([broad, route]);
    expect((await engine.findRoute(projectId, "/users/123", "GET")).route.path).toBe("/users/:id");
    const other = { ...route, path: "/users/:name" };
    for (const candidates of [[other, route], [route, other]]) {
      expect((await setup(candidates).engine.findRoute(projectId, "/users/123", "GET")).route.path).toBe("/users/:id");
    }
  });

  test("matches complete nonempty segments without treating literals as regex", () => {
    expect(matchRoutePath("/teams/:teamId/users/:id", "/teams/abc/users/123"))
      .toEqual({ teamId: "abc", id: "123" });
    for (const path of ["/users/", "/users/123/extra", "/users/123/", "/other/123"]) {
      expect(matchRoutePath("/users/:id", path)).toBeUndefined();
    }
    expect(matchRoutePath("/v1.0/:id", "/v1x0/123")).toBeUndefined();
    expect(matchRoutePath("/users/:id/:id", "/users/123/456")).toBeUndefined();
  });

  test("decodes captures exactly once after segment matching", () => {
    expect(matchRoutePath("/users/:id", "/users/a%2Fb")).toEqual({ id: "a/b" });
    expect(matchRoutePath("/users/:id", "/users/a%252Fb")).toEqual({ id: "a%2Fb" });
    expect(matchRoutePath("/users/:id", "/users/Jane%20Doe")).toEqual({ id: "Jane Doe" });
    expect(() => matchRoutePath("/users/:id", "/users/%ZZ")).toThrow("Invalid URL encoding");
  });

  test("validates required body fields before rendering a dynamic response", async () => {
    const { controller } = setup([{ ...route, method: "POST", requiredBody: ["email"] }]);
    const request = new Request("http://localhost/users/123", { method: "POST", body: "{}" });
    await expect(controller.execute(projectId, "Bearer test", "/users/123", "POST", request))
      .rejects.toMatchObject({ status: 400, message: "Missing required body fields: email." });
  });

  test("does not fetch dynamic candidates when authentication fails", async () => {
    const exact = mock(async () => undefined);
    const dynamic = mock(async () => [route]);
    const engine = new Engine({ findProjectByIdAndToken: async () => undefined }, {
      findByPathAndMethod: exact, findDynamicByMethod: dynamic,
    });
    await expect(new ExecutionService(engine).execute(projectId, "wrong", "/users/123", "GET"))
      .rejects.toMatchObject({ status: 401 });
    expect(exact).not.toHaveBeenCalled();
    expect(dynamic).not.toHaveBeenCalled();
  });
});

describe("response placeholders", () => {
  test("renders nested string values while preserving JSON types and object keys", () => {
    expect(resolveResponseBody({
      "{{params.id}}": ["{{params.id}}", { label: "User {{ params.id }} / {{params.id}}" }],
      count: 2, enabled: false, empty: null,
    }, { id: "123" })).toEqual({
      "{{params.id}}": ["123", { label: "User 123 / 123" }],
      count: 2, enabled: false, empty: null,
    });
  });

  test("leaves unknown placeholders and expressions unchanged", () => {
    const body = "{{params.missing}} {{params.toString}} {{params.id + 1}}";
    expect(resolveResponseBody(body, { id: "123" })).toBe(body);
  });

  test("does not evaluate or re-expand captured values", () => {
    const value = '"\\$&{{params.other}}';
    expect(resolveResponseBody("{{params.id}}", { id: value, other: "secret" })).toBe(value);
  });

  test("handles prototype-like names as data", () => {
    const params = matchRoutePath("/users/:__proto__", "/users/123")!;
    const body = JSON.parse('{"__proto__":"{{params.__proto__}}"}');
    const result = resolveResponseBody(body, params);
    expect(JSON.stringify(result)).toBe('{"__proto__":"123"}');
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  });
});

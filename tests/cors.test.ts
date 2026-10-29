import { describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import type { MockRoute } from "@apimirror/database/schema";
import { playgroundCors } from "../src/core/cors";
import { DomainError } from "../src/core/error";
import { ExecutionError } from "../src/features/engine/engine.error";
import { Engine } from "../src/features/engine/engine";
import { ExecutionController } from "../src/features/execution/execution.controller";
import { ExecutionService } from "../src/features/execution/execution.service";

const projectId = "550e8400-e29b-41d4-a716-446655440000";
const url = `http://localhost/mock/${projectId}/users`;
const route: MockRoute = {
  id: "650e8400-e29b-41d4-a716-446655440000", projectId,
  method: "POST", path: "/users", statusCode: 201,
  responseBody: { message: "Hello {{body.name}}" }, requiredBody: ["name"],
  createdAt: new Date(), updatedAt: new Date(),
};

function setup(authorized = true, savedRoute: MockRoute | null = route) {
  const tokenLookup = mock(async () => authorized ? { id: projectId } : undefined);
  const routeLookup = mock(async () => savedRoute ?? undefined);
  const controller = new ExecutionController(new ExecutionService(new Engine(
    { findProjectByIdAndToken: tokenLookup },
    { findByPathAndMethod: routeLookup, findDynamicByMethod: async () => [] },
  )));
  const app = new Elysia().use(playgroundCors)
    .onError(({ error, status }) => {
      if (error instanceof DomainError || error instanceof ExecutionError) {
        return status(error.status, { message: error.message });
      }
    })
    .all("/mock/:projectId/*", ({ params, request }) => controller.execute(
      params.projectId, request.headers.get("authorization"), "/users", request.method, request,
    ), { parse: "none" });
  return { app, tokenLookup, routeLookup };
}

function expectCors(response: Response) {
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
  expect(response.headers.get("access-control-allow-credentials")).toBeNull();
}

describe("playground browser CORS", () => {
  test("preflights succeed without authentication or database queries for every supported method", async () => {
    const { app, tokenLookup, routeLookup } = setup(false);
    for (const origin of ["http://localhost:3000", "https://client.example"]) {
      for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
        const response = await app.handle(new Request(url, {
          method: "OPTIONS",
          headers: {
            origin, "access-control-request-method": method,
            "access-control-request-headers": "authorization,content-type",
          },
        }));
        expect(response.status).toBe(204);
        expect(await response.text()).toBe("");
        expectCors(response);
        expect(response.headers.get("access-control-allow-methods")?.split(/,\s*/)).toContain(method);
        expect(response.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("authorization");
        expect(response.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("content-type");
      }
    }
    expect(tokenLookup).not.toHaveBeenCalled();
    expect(routeLookup).not.toHaveBeenCalled();
  });

  test("authenticated JSON responses retain CORS headers", async () => {
    const response = await setup().app.handle(new Request(url, {
      method: "POST", headers: { origin: "https://client.example", authorization: "Bearer test", "content-type": "application/json" },
      body: '{"name":"Alex"}',
    }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ message: "Hello Alex" });
    expectCors(response);
  });

  test("missing and invalid tokens still return readable 401 responses", async () => {
    for (const authorization of [null, "Bearer invalid"]) {
      const { app, routeLookup } = setup(false);
      const headers = new Headers({ origin: "https://client.example" });
      if (authorization) headers.set("authorization", authorization);
      const response = await app.handle(new Request(url, { method: "POST", headers }));
      expect(response.status).toBe(401);
      expectCors(response);
      expect(routeLookup).not.toHaveBeenCalled();
    }
  });

  test("route-not-found and body validation errors retain CORS headers", async () => {
    for (const [savedRoute, expected] of [[null, 404], [route, 400]] as const) {
      const response = await setup(true, savedRoute).app.handle(new Request(url, {
        method: "POST", headers: { origin: "https://client.example", authorization: "Bearer test" }, body: "{}",
      }));
      expect(response.status).toBe(expected);
      expectCors(response);
    }
  });

  test("ordinary OPTIONS requests execute mock routes and require authentication", async () => {
    const { app, routeLookup } = setup(true, { ...route, method: "OPTIONS", statusCode: 202, requiredBody: [], responseBody: { mock: true } });
    const response = await app.handle(new Request(url, {
      method: "OPTIONS", headers: { origin: "https://client.example", authorization: "Bearer test" },
    }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ mock: true });
    expectCors(response);
    expect(routeLookup).toHaveBeenCalledWith(projectId, "/users", "OPTIONS");
    const unauthorized = await app.handle(new Request(url, { method: "OPTIONS", headers: { origin: "https://client.example" } }));
    expect(unauthorized.status).toBe(401);
    expectCors(unauthorized);
  });
});

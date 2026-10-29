import { describe, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import { Engine } from "../src/features/engine/engine";
import { ExecutionError } from "../src/features/engine/engine.error";
import { ExecutionService } from "../src/features/execution/execution.service";
import { ExecutionController } from "../src/features/execution/execution.controller";
import type { MockRoute } from "@apimirror/database/schema";

const projectId = "550e8400-e29b-41d4-a716-446655440000";
const token = "am_live_test-token";
const route: MockRoute = {
  id: "650e8400-e29b-41d4-a716-446655440000",
  projectId,
  method: "GET",
  path: "/users",
  statusCode: 200,
  responseBody: { users: [] },
  requiredBody: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("execution project validation", () => {
  test("rejects malformed IDs before accessing the database", async () => {
    const lookup = mock(async () => undefined);
    const engine = new Engine({ findProjectByIdAndToken: lookup }, { findDynamicByMethod: async () => [], findByPathAndMethod: async () => route });
    for (const invalidId of ["YOUR_PROJECT_ID", "invalid", "", "550e8400-e29b-41d4-a716-44665544000z"]) {
      await expect(engine.assertValidateProject(invalidId, token))
        .rejects.toMatchObject({ status: 400 });
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  test("rejects missing or malformed bearer headers before accessing the database", async () => {
    const lookup = mock(async () => undefined);
    const engine = new Engine({ findProjectByIdAndToken: lookup }, { findDynamicByMethod: async () => [], findByPathAndMethod: async () => route });
    const controller = new ExecutionController(new ExecutionService(engine));
    for (const header of [null, "", "Bearer", "Basic abc", "Bearer one two"]) {
      await expect(controller.execute(projectId, header, "/users", "GET"))
        .rejects.toMatchObject({ status: 401, message: "Invalid project or token." });
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  test("execution checks the project with the hashed token", async () => {
    const lookup = mock(async () => ({ id: projectId }));
    const service = new ExecutionService(new Engine({ findProjectByIdAndToken: lookup }, { findDynamicByMethod: async () => [], findByPathAndMethod: async () => route }));
    const controller = new ExecutionController(service);
    const response = await controller.execute(projectId, `bearer ${token}`, "/users", "GET");
    expect(response.status).toBe(route.statusCode);
    expect(await response.json()).toEqual(route.responseBody);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith(
      projectId,
      createHash("sha256").update(token).digest("hex"),
    );
  });

  test("execution rejects a project/token pair that does not match", async () => {
    const lookup = mock(async () => undefined);
    const service = new ExecutionService(new Engine({ findProjectByIdAndToken: lookup }, { findDynamicByMethod: async () => [], findByPathAndMethod: async () => route }));
    await expect(service.execute(projectId, token, "/users", "GET"))
      .rejects.toMatchObject({ status: 401, message: "Invalid project or token." });
  });

  test("database failures propagate instead of becoming successful or unauthorized responses", async () => {
    const failure = new Error("Database unavailable");
    const engine = new Engine({ findProjectByIdAndToken: async () => { throw failure; } }, { findDynamicByMethod: async () => [], findByPathAndMethod: async () => route });
    try {
      await engine.assertValidateProject(projectId, token);
      throw new Error("Expected database failure");
    } catch (error) {
      expect(error).toBe(failure);
      expect(error).not.toBeInstanceOf(ExecutionError);
    }
  });
});

describe("mock HTTP responses", () => {
  function controllerFor(overrides: Partial<MockRoute>) {
    const engine = new Engine(
      { findProjectByIdAndToken: async () => ({ id: projectId }) },
      { findDynamicByMethod: async () => [], findByPathAndMethod: async () => ({ ...route, ...overrides }) },
    );
    return new ExecutionController(new ExecutionService(engine));
  }

  test("returns the configured success or error status and JSON body", async () => {
    for (const statusCode of [200, 201, 400, 404, 500, 503, 599]) {
      const response = await controllerFor({ statusCode }).execute(projectId, `Bearer ${token}`, "/users", "GET");
      expect(response.status).toBe(statusCode);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(await response.json()).toEqual(route.responseBody);
    }
  });

  test("preserves JSON scalars, null and arrays", async () => {
    for (const responseBody of [null, false, 0, "hello", [1, 2]]) {
      const response = await controllerFor({ responseBody }).execute(projectId, `Bearer ${token}`, "/users", "GET");
      expect(await response.json()).toEqual(responseBody);
    }
  });

  test("204, 205 and 304 omit the stored body", async () => {
    for (const statusCode of [204, 205, 304]) {
      const response = await controllerFor({ statusCode }).execute(projectId, `Bearer ${token}`, "/users", "GET");
      expect(response.status).toBe(statusCode);
      expect(response.body).toBeNull();
      expect(await response.text()).toBe("");
    }
  });

  test("HEAD preserves status but omits the stored body", async () => {
    const response = await controllerFor({ method: "HEAD", statusCode: 404 })
      .execute(projectId, `Bearer ${token}`, "/users", "HEAD");
    expect(response.status).toBe(404);
    expect(response.body).toBeNull();
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  test("rejects invalid stored statuses before constructing a response", async () => {
    for (const statusCode of [100, 199, 600, 200.5]) {
      await expect(controllerFor({ statusCode }).execute(projectId, `Bearer ${token}`, "/users", "GET"))
        .rejects.toMatchObject({ status: 400, message: "Mock route status code must be between 200 and 599." });
    }
  });
});

describe("engine route lookup", () => {
  test("checks credentials before looking up the exact project, path and method", async () => {
    const calls: string[] = [];
    const lookup = mock(async () => { calls.push("route"); return route; });
    const engine = new Engine({
      findProjectByIdAndToken: async () => { calls.push("auth"); return { id: projectId }; },
    }, { findDynamicByMethod: async () => [], findByPathAndMethod: lookup });

    expect(await new ExecutionService(engine).execute(projectId, token, "/users", "GET")).toEqual(route);
    expect(calls).toEqual(["auth", "route"]);
    expect(lookup).toHaveBeenCalledWith(projectId, "/users", "GET");
  });

  test("does not look up a route when authentication fails", async () => {
    const lookup = mock(async () => route);
    const engine = new Engine({ findProjectByIdAndToken: async () => undefined }, { findDynamicByMethod: async () => [], findByPathAndMethod: lookup });
    await expect(new ExecutionService(engine).execute(projectId, token, "/users", "GET"))
      .rejects.toMatchObject({ status: 401 });
    expect(lookup).not.toHaveBeenCalled();
  });

  test("returns 404 when no route matches", async () => {
    const lookup = mock(async () => undefined);
    const engine = new Engine({ findProjectByIdAndToken: async () => ({ id: projectId }) }, { findDynamicByMethod: async () => [], findByPathAndMethod: lookup });
    await expect(new ExecutionService(engine).execute(projectId, token, "/missing", "POST"))
      .rejects.toMatchObject({ status: 404, message: "Mock route not found." });
    expect(lookup).toHaveBeenCalledWith(projectId, "/missing", "POST");
  });

  test("unsupported methods never reach the PostgreSQL enum comparison", async () => {
    const lookup = mock(async () => route);
    const engine = new Engine({ findProjectByIdAndToken: async () => ({ id: projectId }) }, { findDynamicByMethod: async () => [], findByPathAndMethod: lookup });
    await expect(engine.findRoute(projectId, "/users", "TRACE"))
      .rejects.toMatchObject({ status: 404 });
    expect(lookup).not.toHaveBeenCalled();
  });
});

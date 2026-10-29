import { describe, expect, mock, test } from "bun:test";
import type { MockRoute } from "@apimirror/database/schema";
import { Engine } from "../src/features/engine/engine";
import { ExecutionService } from "../src/features/execution/execution.service";
import { ExecutionController } from "../src/features/execution/execution.controller";

const projectId = "550e8400-e29b-41d4-a716-446655440000";
const route: MockRoute = {
  id: "650e8400-e29b-41d4-a716-446655440000",
  projectId,
  method: "POST",
  path: "/login",
  statusCode: 201,
  responseBody: { success: true },
  requiredBody: ["email", "password"],
  createdAt: new Date(),
  updatedAt: new Date(),
};

function setup(requiredBody = route.requiredBody, authorized = true, found = true) {
  const engine = new Engine(
    { findProjectByIdAndToken: async () => authorized ? { id: projectId } : undefined },
    { findDynamicByMethod: async () => [], findByPathAndMethod: async () => found ? { ...route, requiredBody } : undefined },
  );
  const service = new ExecutionService(engine);
  const controller = new ExecutionController(service);
  return { engine, service, controller };
}

function execute(body: string | undefined, requiredBody = route.requiredBody) {
  const request = new Request(`http://localhost/mock/${projectId}/login`, {
    method: "POST",
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    body,
  });
  return setup(requiredBody).controller.execute(projectId, request.headers.get("authorization"), "/login", "POST", request);
}

describe("required request body", () => {
  test("returns the configured response when all fields are present", async () => {
    const response = await execute(JSON.stringify({ email: "a@example.com", password: "test", extra: true }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ success: true });
  });

  test("reports missing top-level fields", async () => {
    await expect(execute('{"email":"a@example.com"}')).rejects.toMatchObject({
      status: 400, message: "Missing required body fields: password.",
    });
    await expect(execute('{"nested":{"email":"a","password":"b"}}')).rejects.toMatchObject({
      status: 400, message: "Missing required body fields: email, password.",
    });
  });

  test("rejects empty and malformed JSON", async () => {
    for (const body of [undefined, "", "{broken", "email=a&password=b"]) {
      await expect(execute(body)).rejects.toMatchObject({ status: 400, message: "Request body must be valid JSON." });
    }
  });

  test("rejects non-object JSON", async () => {
    for (const body of ["null", "[]", '"text"', "0", "false"]) {
      await expect(execute(body)).rejects.toMatchObject({ status: 400, message: "Request body must be a JSON object." });
    }
  });

  test("null, false, zero and empty strings count as present", async () => {
    for (const value of [null, false, 0, ""]) {
      const response = await execute(JSON.stringify({ email: value, password: value }));
      expect(response.status).toBe(201);
    }
  });

  test("requires own properties, including special names", () => {
    const { engine } = setup();
    expect(() => engine.assertRequiredBody(["toString", "__proto__"], {})).toThrow("Missing required body fields");
    expect(() => engine.assertRequiredBody(["toString", "__proto__"], JSON.parse('{"toString":null,"__proto__":null}'))).not.toThrow();
    expect(() => engine.assertRequiredBody(["email"], Object.create({ email: "inherited" }))).toThrow("Missing required body fields");
  });

  test("does not read a body before authentication or route lookup succeeds", async () => {
    const readBody = mock(async () => { throw new Error("Body must not be read"); });
    await expect(setup(undefined, false).service.execute(projectId, "test-token", "/login", "POST", readBody))
      .rejects.toMatchObject({ status: 401 });
    await expect(setup(undefined, true, false).service.execute(projectId, "test-token", "/missing", "POST", readBody))
      .rejects.toMatchObject({ status: 404 });
    expect(readBody).not.toHaveBeenCalled();
  });

  test("does not require or parse a body when no fields are required", async () => {
    const readBody = mock(async () => { throw new Error("Body must not be read"); });
    expect(await setup([]).service.execute(projectId, "test-token", "/login", "POST", readBody))
      .toMatchObject({ requiredBody: [] });
    expect(readBody).not.toHaveBeenCalled();
    expect((await execute("not JSON", [])).status).toBe(201);
  });
});

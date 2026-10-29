import type { JsonValue } from "@apimirror/database/schema";

export function usesRequestBody(body: JsonValue): boolean {
  if (typeof body === "string") return /\{\{\s*body\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/.test(body);
  if (Array.isArray(body)) return body.some(usesRequestBody);
  if (body !== null && typeof body === "object") return Object.values(body).some(usesRequestBody);
  return false;
}

export function resolveResponseBody(
  body: JsonValue,
  params: Record<string, string>,
  requestBody: unknown = undefined,
): JsonValue {
  if (typeof body === "string") {
    return body.replace(/\{\{\s*(params|body)\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (placeholder, source: string, name: string) => {
      if (source === "params") return Object.hasOwn(params, name) ? params[name]! : placeholder;
      if (requestBody === null || typeof requestBody !== "object" || Array.isArray(requestBody)
        || !Object.hasOwn(requestBody, name)) return placeholder;
      const value = (requestBody as Record<string, unknown>)[name];
      return typeof value === "string" ? value : JSON.stringify(value) ?? placeholder;
    });
  }
  if (Array.isArray(body)) {
    return body.map((value) => resolveResponseBody(value, params, requestBody));
  }
  if (body !== null && typeof body === "object") {
    return Object.fromEntries(Object.entries(body).map(([key, value]) => [key, resolveResponseBody(value, params, requestBody)]));
  }
  return body;
}

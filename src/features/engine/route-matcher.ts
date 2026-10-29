import { BadRequestError } from "../../core/error";

const parameterSegment = /^:([A-Za-z_][A-Za-z0-9_]*)$/;

export function isDynamicPath(path: string) {
  return path.split("/").some((segment) => parameterSegment.test(segment));
}

// Prefer literal segments from left to right, then use path order to break ties.
export function compareRoutePaths(left: string, right: string) {
  const leftParts = left.split("/");
  const rightParts = right.split("/");
  for (let i = 0; i < Math.min(leftParts.length, rightParts.length); i++) {
    const difference = Number(parameterSegment.test(leftParts[i]!)) - Number(parameterSegment.test(rightParts[i]!));
    if (difference !== 0) return difference;
  }
  return left < right ? -1 : left > right ? 1 : 0;
}

export function matchRoutePath(template: string, path: string): Record<string, string> | undefined {
  const templateParts = template.split("/");
  const pathParts = path.split("/");
  if (templateParts.length !== pathParts.length) return undefined;

  const captures: [string, string][] = [];
  for (let i = 0; i < templateParts.length; i++) {
    const segment = pathParts[i]!;
    const parameter = parameterSegment.exec(templateParts[i]!);
    if (!parameter) {
      if (templateParts[i] !== segment) return undefined;
    } else {
      if (!segment) return undefined;
      captures.push([parameter[1]!, segment]);
    }
  }

  const params: Record<string, string> = Object.create(null);
  for (const [name, segment] of captures) {
    let value: string;
    try {
      value = decodeURIComponent(segment);
    } catch {
      throw new BadRequestError("Invalid URL encoding in path parameter.");
    }
    if (Object.hasOwn(params, name) && params[name] !== value) return undefined;
    params[name] = value;
  }
  return params;
}

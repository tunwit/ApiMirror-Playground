import { and, eq, like } from "drizzle-orm";
import type { Database } from "@apimirror/database";
import { mockRoute, type MockRoute } from "@apimirror/database/schema";

export type Method = (typeof mockRoute.$inferSelect)["method"];

export class MockRoutesRepo {
  constructor(private readonly db: Database) {}

  findDynamicByMethod(projectId: string, method: Method): Promise<MockRoute[]> {
    return this.db.select().from(mockRoute).where(and(
      eq(mockRoute.projectId, projectId),
      eq(mockRoute.method, method),
      like(mockRoute.path, "%/:%"),
    ));
  }

  async findByPathAndMethod(projectId: string, path: string, method: Method): Promise<MockRoute | undefined> {
    const [route] = await this.db
      .select()
      .from(mockRoute)
      .where(
        and(
          eq(mockRoute.projectId, projectId),
          eq(mockRoute.method, method),
          eq(mockRoute.path, path),
        ),
      )
      .limit(1);
    return route;
  }
}

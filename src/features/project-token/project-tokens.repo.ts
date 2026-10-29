import { and, eq } from "drizzle-orm";
import type { Database } from "@apimirror/database";
import {
  project,
  projectToken,
} from "@apimirror/database/schema";

export class ProjectTokensRepo {
  constructor(private readonly db: Database) {}

  async findProjectByIdAndToken(projectId: string, tokenHash: string): Promise<{ id: string } | undefined> {
    const [result] = await this.db
      .select({ id: project.id })
      .from(project)
      .innerJoin(projectToken, eq(project.id, projectToken.projectId))
      .where(
        and(eq(project.id, projectId), eq(projectToken.tokenHash, tokenHash)),
      )
      .limit(1);
    return result;
  }
}

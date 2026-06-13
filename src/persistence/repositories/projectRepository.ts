import { z } from "zod";
import type { ProjectDocumentV1 } from "../../domain/production-line/types";
import { database } from "../database";
import { migrateProjectDocument } from "../migrations/projectMigrations";

export interface ProjectExportV1 {
  format: "itemcalc-project";
  formatVersion: 1;
  exportedAt: string;
  project: ProjectDocumentV1;
}

const projectExportSchema = z.object({
  format: z.literal("itemcalc-project"),
  formatVersion: z.literal(1),
  exportedAt: z.iso.datetime(),
  project: z.unknown()
});

export class ProjectRepository {
  async getCurrent(): Promise<ProjectDocumentV1 | null> {
    const record = await database.projects.orderBy("updatedAt").reverse().first();

    if (record === undefined) {
      return null;
    }

    return migrateProjectDocument(record.data);
  }

  async save(project: ProjectDocumentV1): Promise<void> {
    await database.transaction("rw", database.projects, async () => {
      await database.projects.clear();
      await database.projects.put({
        id: project.id,
        name: project.name,
        schemaVersion: project.schemaVersion,
        updatedAt: project.updatedAt,
        data: project
      });
    });
  }

  importDocument(value: unknown): ProjectDocumentV1 {
    const parsed = projectExportSchema.safeParse(value);

    if (!parsed.success) {
      throw new Error("Invalid project import format.");
    }

    let project: ProjectDocumentV1;
    try {
      project = migrateProjectDocument(parsed.data.project);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Project document uses an unsupported future schema version."
      ) {
        throw error;
      }

      throw new Error("Invalid project import format.", {
        cause: error
      });
    }

    return project;
  }
}

export function buildProjectExport(project: ProjectDocumentV1): ProjectExportV1 {
  return {
    format: "itemcalc-project",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    project
  };
}

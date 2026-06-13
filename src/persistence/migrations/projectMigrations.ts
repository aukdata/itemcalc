import { z } from "zod";
import type { ProjectDocumentV1 } from "../../domain/production-line/types";
import { projectDocumentSchema } from "../../domain/schemas/productionLineSchema";

const legacyProjectDocumentV0Schema = z.looseObject({
  schemaVersion: z.literal(0),
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  line: z.looseObject({
    schemaVersion: z.literal(1),
    id: z.string().trim().min(1),
    processes: z.array(z.unknown()),
    externalInputs: z.array(z.unknown()),
    disposals: z.array(z.unknown()),
    targets: z.array(z.unknown()),
    options: z.object({
      optimizationMode: z.enum(["minimizeExternalThenPower", "minimizePowerThenExternal"]),
      epsilon: z.number()
    })
  }),
  editor: z.looseObject({
    nodes: z.array(z.unknown()),
    edges: z.array(z.unknown())
  })
});

export function migrateProjectDocument(value: unknown): ProjectDocumentV1 {
  const current = projectDocumentSchema.safeParse(value);
  if (current.success) {
    return current.data as ProjectDocumentV1;
  }

  const legacyV0 = legacyProjectDocumentV0Schema.safeParse(value);
  if (legacyV0.success) {
    const migrated = {
      ...legacyV0.data,
      schemaVersion: 1 as const,
      line: {
        ...legacyV0.data.line,
        name: legacyV0.data.name
      },
      editor: {
        ...legacyV0.data.editor,
        viewport: legacyV0.data.editor.viewport ?? { x: 0, y: 0, zoom: 1 }
      }
    };

    const parsedMigrated = projectDocumentSchema.safeParse(migrated);
    if (!parsedMigrated.success) {
      throw new Error("Stored project document is invalid.");
    }

    return parsedMigrated.data as ProjectDocumentV1;
  }

  const versionProbe = z.object({ schemaVersion: z.number().int() }).safeParse(value);
  if (versionProbe.success && versionProbe.data.schemaVersion > 1) {
    throw new Error("Project document uses an unsupported future schema version.");
  }

  throw new Error("Stored project document is invalid.");
}

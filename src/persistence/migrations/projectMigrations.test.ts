import { sampleProject } from "../../features/editor/sampleProject";
import { migrateProjectDocument } from "./projectMigrations";

describe("migrateProjectDocument", () => {
  it("returns current v1 documents unchanged", () => {
    const migrated = migrateProjectDocument(sampleProject);
    expect(migrated).toEqual(sampleProject);
  });

  it("migrates legacy v0 documents to v1", () => {
    const legacyProject = {
      ...sampleProject,
      schemaVersion: 0 as const,
      line: {
        ...sampleProject.line,
        name: undefined
      },
      editor: {
        nodes: sampleProject.editor.nodes,
        edges: sampleProject.editor.edges
      }
    };

    const migrated = migrateProjectDocument(legacyProject);
    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.line.name).toBe(sampleProject.name);
    expect(migrated.editor.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("rejects unknown future versions", () => {
    expect(() => {
      migrateProjectDocument({
        schemaVersion: 99,
        id: "future-project"
      });
    }).toThrow("Project document uses an unsupported future schema version.");
  });
});

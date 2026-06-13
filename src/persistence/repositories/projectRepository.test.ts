import { buildProjectExport, ProjectRepository } from "./projectRepository";
import { sampleProject } from "../../features/editor/sampleProject";

describe("ProjectRepository", () => {
  it("builds and re-imports a project export envelope", () => {
    const repository = new ProjectRepository();
    const exported = buildProjectExport(sampleProject);
    const imported = repository.importDocument(exported);

    expect(imported.id).toBe(sampleProject.id);
    expect(imported.line.id).toBe(sampleProject.line.id);
    expect(imported.name).toBe(sampleProject.name);
  });

  it("rejects invalid import envelopes", () => {
    const repository = new ProjectRepository();

    expect(() => {
      repository.importDocument({
        format: "itemcalc-project",
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        project: { invalid: true }
      });
    }).toThrow("Invalid project import format.");
  });

  it("migrates legacy v0 imports", () => {
    const repository = new ProjectRepository();

    const imported = repository.importDocument({
      format: "itemcalc-project",
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      project: {
        ...sampleProject,
        schemaVersion: 0,
        line: {
          ...sampleProject.line,
          name: undefined
        },
        editor: {
          nodes: sampleProject.editor.nodes,
          edges: sampleProject.editor.edges
        }
      }
    });

    expect(imported.schemaVersion).toBe(1);
    expect(imported.line.name).toBe(sampleProject.name);
    expect(imported.editor.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});

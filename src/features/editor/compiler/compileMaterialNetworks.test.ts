import { compileMaterialNetworks } from "./compileMaterialNetworks";
import { sampleProject } from "../sampleProject";

describe("compileMaterialNetworks", () => {
  it("compiles the sample project into one network per material path", () => {
    const compiled = compileMaterialNetworks(sampleProject.line, sampleProject.editor);

    expect(compiled.diagnostics).toHaveLength(0);
    expect(compiled.line).toBeDefined();
    expect(compiled.line?.networks).toHaveLength(4);
    expect(compiled.line?.targets[0]?.networkId).toContain("node-target-polyethylene");
  });
});

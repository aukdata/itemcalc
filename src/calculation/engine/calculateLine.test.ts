import { calculateLine } from "./calculateLine";
import { compileMaterialNetworks } from "../../features/editor/compiler/compileMaterialNetworks";
import { sampleProject } from "../../features/editor/sampleProject";

describe("calculateLine", () => {
  it("solves the sample project and derives machine and power results", async () => {
    const compiled = compileMaterialNetworks(sampleProject.line, sampleProject.editor);

    if (compiled.line === undefined) {
      throw new Error("Sample project did not compile.");
    }

    const result = await calculateLine(compiled.line);

    expect(result.status).toBe("solved");
    expect(result.diagnostics).toHaveLength(0);
    expect(result.processes).toHaveLength(2);
    expect(result.power.averageEUt).toBeGreaterThan(0);

    const reactor = result.processes.find((process) => process.processId === "process-reactor");
    const cracker = result.processes.find((process) => process.processId === "process-cracker");

    expect(reactor?.placedMachineCount).toBe(1);
    expect(cracker?.placedMachineCount).toBe(1);

    const oxygenNetwork = result.networks.find((network) =>
      network.networkId.includes("node-external-oxygen")
    );
    expect(oxygenNetwork?.externalFlowPerTick).toBeGreaterThan(0);
  });
});

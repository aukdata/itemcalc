import { sampleProject } from "../sampleProject";
import { useEditorStore } from "./editorStore";

describe("useEditorStore", () => {
  beforeEach(() => {
    useEditorStore.getState().replaceProject(sampleProject);
  });

  it("updates project name and supports undo/redo", () => {
    useEditorStore.getState().updateProjectName("Renamed Project");
    expect(useEditorStore.getState().project.name).toBe("Renamed Project");

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().project.name).toBe(sampleProject.name);

    useEditorStore.getState().redo();
    expect(useEditorStore.getState().project.name).toBe("Renamed Project");
  });

  it("updates target flow in canonical per-tick units", () => {
    useEditorStore.getState().updateTargetFlow("target-polyethylene", 0.25);
    expect(useEditorStore.getState().project.line.targets[0]?.requiredFlowPerTick).toBe(0.25);
  });

  it("updates editor viewport state", () => {
    useEditorStore.getState().updateViewport({ x: 120, y: -80, zoom: 0.75 });
    expect(useEditorStore.getState().project.editor.viewport).toEqual({
      x: 120,
      y: -80,
      zoom: 0.75
    });
  });

  it("creates and deletes edges through selection-aware actions", () => {
    useEditorStore.getState().createNode("targetOutput");
    const createdTargetNode = useEditorStore
      .getState()
      .project.editor.nodes.find((node) => node.entityId.startsWith("target-"));

    expect(createdTargetNode).toBeDefined();
    if (createdTargetNode === undefined) {
      throw new Error("Expected created target node.");
    }

    useEditorStore.getState().createEdge("node-reactor", createdTargetNode.id);
    expect(useEditorStore.getState().project.editor.edges).toHaveLength(4);

    useEditorStore.getState().selectNode("node-reactor");
    useEditorStore.getState().deleteSelectedNodes();

    expect(
      useEditorStore.getState().project.line.processes.find((process) => process.id === "process-reactor")
    ).toBeUndefined();
  });

  it("adds, updates, and removes process recipe rows", () => {
    const originalProcess = useEditorStore
      .getState()
      .project.line.processes.find((process) => process.id === "process-reactor");

    expect(originalProcess).toBeDefined();
    if (originalProcess === undefined) {
      throw new Error("Expected sample process.");
    }

    useEditorStore.getState().addProcessInput("process-reactor");
    useEditorStore.getState().addProcessOutput("process-reactor");

    const expandedProcess = useEditorStore
      .getState()
      .project.line.processes.find((process) => process.id === "process-reactor");
    expect(expandedProcess?.inputs).toHaveLength(originalProcess.inputs.length + 1);
    expect(expandedProcess?.outputs).toHaveLength(originalProcess.outputs.length + 1);

    const addedInput = expandedProcess?.inputs.at(-1);
    const addedOutput = expandedProcess?.outputs.at(-1);
    expect(addedInput).toBeDefined();
    expect(addedOutput).toBeDefined();
    if (addedInput === undefined || addedOutput === undefined) {
      throw new Error("Expected created recipe rows.");
    }

    useEditorStore.getState().updateProcessInput("process-reactor", addedInput.id, {
      ...addedInput,
      amountPerRun: 4,
      material: { kind: "fluid", name: "Steam" }
    });
    useEditorStore.getState().updateProcessOutput("process-reactor", addedOutput.id, {
      ...addedOutput,
      amountPerRun: 2.5
    });

    const updatedProcess = useEditorStore
      .getState()
      .project.line.processes.find((process) => process.id === "process-reactor");
    expect(updatedProcess?.inputs.at(-1)).toMatchObject({
      amountPerRun: 4,
      material: { kind: "fluid", name: "Steam" }
    });
    expect(updatedProcess?.outputs.at(-1)).toMatchObject({
      amountPerRun: 2.5
    });

    useEditorStore.getState().removeProcessInput("process-reactor", addedInput.id);
    useEditorStore.getState().removeProcessOutput("process-reactor", addedOutput.id);

    const reducedProcess = useEditorStore
      .getState()
      .project.line.processes.find((process) => process.id === "process-reactor");
    expect(reducedProcess?.inputs).toHaveLength(originalProcess.inputs.length);
    expect(reducedProcess?.outputs).toHaveLength(originalProcess.outputs.length);
  });

  it("removes attached edges when removing process ports", () => {
    useEditorStore.getState().createNode("targetOutput");
    const createdTargetNode = useEditorStore
      .getState()
      .project.editor.nodes.find((node) => node.entityId.startsWith("target-"));

    expect(createdTargetNode).toBeDefined();
    if (createdTargetNode === undefined) {
      throw new Error("Expected created target node.");
    }

    useEditorStore.getState().createEdge("node-reactor", createdTargetNode.id);
    const edgeCountBeforeRemoval = useEditorStore.getState().project.editor.edges.length;
    const reactor = useEditorStore
      .getState()
      .project.line.processes.find((process) => process.id === "process-reactor");

    expect(reactor).toBeDefined();
    if (reactor === undefined) {
      throw new Error("Expected sample process.");
    }

    const outputId = reactor.outputs[0]?.id;
    expect(outputId).toBeDefined();
    if (outputId === undefined) {
      throw new Error("Expected sample output.");
    }

    useEditorStore.getState().addProcessOutput("process-reactor");
    useEditorStore.getState().removeProcessOutput("process-reactor", outputId);

    expect(useEditorStore.getState().project.editor.edges).toHaveLength(edgeCountBeforeRemoval - 1);
  });

  it("creates explicit port connections when a process has multiple outputs", () => {
    const targetIdsBefore = new Set(
      useEditorStore
        .getState()
        .project.editor.nodes.filter((node) => node.kind === "targetOutput")
        .map((node) => node.id)
    );
    useEditorStore.getState().addProcessOutput("process-reactor");
    const process = useEditorStore
      .getState()
      .project.line.processes.find((candidate) => candidate.id === "process-reactor");

    expect(process).toBeDefined();
    if (process === undefined) {
      throw new Error("Expected sample process.");
    }

    const secondOutput = process.outputs[1];
    expect(secondOutput).toBeDefined();
    if (secondOutput === undefined) {
      throw new Error("Expected second output.");
    }

    useEditorStore.getState().updateProcessOutput("process-reactor", secondOutput.id, {
      ...secondOutput,
      material: { kind: "item", name: "Scrap" },
      amountPerRun: 1
    });

    useEditorStore.getState().createNode("targetOutput");
    const createdTargetNode = useEditorStore
      .getState()
      .project.editor.nodes.find(
        (node) => node.kind === "targetOutput" && !targetIdsBefore.has(node.id)
      );
    expect(createdTargetNode).toBeDefined();
    if (createdTargetNode === undefined) {
      throw new Error("Expected created target node.");
    }

    useEditorStore.getState().updateMaterialName(createdTargetNode.entityId, "targetOutput", "Scrap");
    const edgeCountBeforeImplicitAttempt = useEditorStore.getState().project.editor.edges.length;
    useEditorStore.getState().createEdge("node-reactor", createdTargetNode.id);
    expect(useEditorStore.getState().project.editor.edges).toHaveLength(edgeCountBeforeImplicitAttempt);

    useEditorStore.getState().createEdge(
      "node-reactor",
      createdTargetNode.id,
      `process-output:${secondOutput.id}`,
      "target-input"
    );

    expect(useEditorStore.getState().project.editor.edges).toHaveLength(edgeCountBeforeImplicitAttempt + 1);
    expect(useEditorStore.getState().project.editor.edges.at(-1)).toMatchObject({
      source: { endpointType: "processOutput", portId: secondOutput.id },
      target: { endpointType: "targetOutput" },
      material: { kind: "item", name: "Scrap" }
    });
  });

  it("updates an existing edge when explicit endpoints are changed", () => {
    useEditorStore.getState().createNode("process");
    const createdProcessNode = useEditorStore
      .getState()
      .project.editor.nodes.findLast((node) => node.kind === "process");

    expect(createdProcessNode).toBeDefined();
    if (createdProcessNode === undefined) {
      throw new Error("Expected created process node.");
    }

    const createdProcess = useEditorStore
      .getState()
      .project.line.processes.find((process) => process.id === createdProcessNode.entityId);
    expect(createdProcess).toBeDefined();
    if (createdProcess === undefined) {
      throw new Error("Expected created process.");
    }

    const createdInput = createdProcess.inputs[0];
    expect(createdInput).toBeDefined();
    if (createdInput === undefined) {
      throw new Error("Expected created input.");
    }

    useEditorStore.getState().updateProcessInput(createdProcess.id, createdInput.id, {
      ...createdInput,
      material: { kind: "fluid", name: "Oxygen" }
    });

    useEditorStore.getState().updateEdge(
      "edge-polyethylene",
      "node-external-oxygen",
      createdProcessNode.id,
      "external-output",
      `process-input:${createdInput.id}`
    );

    const updatedEdge = useEditorStore
      .getState()
      .project.editor.edges.find((edge) => edge.id === "edge-polyethylene");
    expect(updatedEdge).toMatchObject({
      source: { nodeId: "node-external-oxygen", endpointType: "externalInput" },
      target: {
        nodeId: createdProcessNode.id,
        endpointType: "processInput",
        portId: createdInput.id
      },
      material: { kind: "fluid", name: "Oxygen" }
    });
  });

  it("copies and pastes the selected node with shifted position", () => {
    useEditorStore.getState().selectNode("node-reactor");
    useEditorStore.getState().copySelection();
    useEditorStore.getState().pasteClipboard();

    const pastedNode = useEditorStore.getState().project.editor.nodes.at(-1);
    const pastedProcess = useEditorStore.getState().project.line.processes.at(-1);

    expect(pastedNode).toBeDefined();
    expect(pastedProcess).toBeDefined();
    expect(pastedNode?.id).not.toBe("node-reactor");
    expect(pastedProcess?.id).not.toBe("process-reactor");
    expect(pastedNode?.position).toEqual({ x: 688, y: 238 });
    expect(pastedProcess?.machineName).toBe("化学反応機 コピー");
    expect(useEditorStore.getState().selection.nodeIds).toEqual([pastedNode?.id ?? ""]);
  });
});

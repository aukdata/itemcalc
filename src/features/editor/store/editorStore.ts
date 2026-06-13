import { create } from "zustand";
import type {
  CalculationResult,
  EditorEdge,
  EditorNodeKind,
  EditorViewport,
  MaterialRef,
  ProjectDocumentV1,
  RecipeInput,
  RecipeOutput,
  VoltageTier
} from "../../../domain/production-line/types";
import { sampleProject } from "../sampleProject";

interface EditorSnapshot {
  project: ProjectDocumentV1;
}

type ClipboardEntry =
  | {
      kind: "process";
      node: ProjectDocumentV1["editor"]["nodes"][number];
      process: ProjectDocumentV1["line"]["processes"][number];
    }
  | {
      kind: "externalInput";
      node: ProjectDocumentV1["editor"]["nodes"][number];
      externalInput: ProjectDocumentV1["line"]["externalInputs"][number];
    }
  | {
      kind: "targetOutput";
      node: ProjectDocumentV1["editor"]["nodes"][number];
      target: ProjectDocumentV1["line"]["targets"][number];
    }
  | {
      kind: "disposal";
      node: ProjectDocumentV1["editor"]["nodes"][number];
      disposal: ProjectDocumentV1["line"]["disposals"][number];
    };

export type SaveState = "saved" | "unsaved" | "saving" | "saveError";

interface EditorStoreState {
  calculation: CalculationResult | null;
  clipboard: ClipboardEntry | null;
  dirtyRevision: number;
  project: ProjectDocumentV1;
  redoStack: EditorSnapshot[];
  saveErrorMessage: string | null;
  saveState: SaveState;
  savedRevision: number;
  selection: { edgeIds: string[]; nodeIds: string[] };
  undoStack: EditorSnapshot[];
}

interface EditorStoreActions {
  addProcessInput: (processId: string) => void;
  addProcessOutput: (processId: string) => void;
  clearSelection: () => void;
  copySelection: () => void;
  createEdge: (
    sourceNodeId: string | null,
    targetNodeId: string | null,
    sourceHandleId?: string | null,
    targetHandleId?: string | null
  ) => void;
  createNode: (kind: EditorNodeKind) => void;
  deleteSelectedNodes: () => void;
  markCalculation: (result: CalculationResult | null) => void;
  markSaveError: (message: string) => void;
  markSaved: (updatedAt: string) => void;
  markSaving: () => void;
  moveNode: (nodeId: string, position: { x: number; y: number }) => void;
  newProject: () => void;
  pasteClipboard: () => void;
  redo: () => void;
  replaceProject: (project: ProjectDocumentV1) => void;
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  undo: () => void;
  updateDisposalLabel: (disposalId: string, label: string) => void;
  updateExternalLabel: (externalId: string, label: string) => void;
  updateExternalLimits: (
    externalId: string,
    maximumFlowPerTick: number | undefined,
    costPerUnit: number | undefined
  ) => void;
  updateMaterialName: (entityId: string, nodeKind: EditorNodeKind, name: string) => void;
  updateOperatingTier: (processId: string, tier: VoltageTier) => void;
  updateProcessCircuitNumber: (processId: string, circuitNumber: number | undefined) => void;
  updateProcessInput: (processId: string, inputId: string, input: RecipeInput) => void;
  updateProcessMachineName: (processId: string, machineName: string) => void;
  updateProcessMetrics: (processId: string, baseDurationTicks: number, basePowerEUt: number) => void;
  updateProcessMinimumTier: (processId: string, tier: VoltageTier) => void;
  updateProcessOutput: (processId: string, outputId: string, output: RecipeOutput) => void;
  updateProjectName: (name: string) => void;
  updateTargetDetails: (targetId: string, label: string, requiredFlowPerTick: number) => void;
  updateTargetLabel: (targetId: string, label: string) => void;
  updateTargetFlow: (targetId: string, requiredFlowPerTick: number) => void;
  updateViewport: (viewport: EditorViewport) => void;
  updateEdge: (
    edgeId: string,
    sourceNodeId: string | null,
    targetNodeId: string | null,
    sourceHandleId?: string | null,
    targetHandleId?: string | null
  ) => void;
  removeProcessInput: (processId: string, inputId: string) => void;
  removeProcessOutput: (processId: string, outputId: string) => void;
}

type EditorStore = EditorStoreState & EditorStoreActions;

function cloneProject(project: ProjectDocumentV1): ProjectDocumentV1 {
  return structuredClone(project);
}

function snapshot(project: ProjectDocumentV1): EditorSnapshot {
  return { project: cloneProject(project) };
}

function nowIso(): string {
  return new Date().toISOString();
}

function mutateProject(
  state: EditorStoreState,
  updater: (project: ProjectDocumentV1) => void
): Partial<EditorStoreState> {
  const nextProject = cloneProject(state.project);
  const previous = snapshot(state.project);
  updater(nextProject);
  nextProject.updatedAt = nowIso();

  return {
    calculation: null,
    dirtyRevision: state.dirtyRevision + 1,
    project: nextProject,
    redoStack: [],
    saveErrorMessage: null,
    saveState: "unsaved",
    undoStack: [...state.undoStack, previous].slice(-100)
  };
}

function createEmptyProject(): ProjectDocumentV1 {
  const project = cloneProject(sampleProject);
  const stamp = nowIso();
  project.id = crypto.randomUUID();
  project.name = "新しいプロジェクト";
  project.createdAt = stamp;
  project.updatedAt = stamp;
  project.line.id = crypto.randomUUID();
  project.line.name = project.name;
  return project;
}

function makeNodePosition(nodeCount: number) {
  const row = Math.floor(nodeCount / 3);
  const column = nodeCount % 3;
  return {
    x: 120 + column * 260,
    y: 120 + row * 180
  };
}

function defaultMaterialName(kind: EditorNodeKind): string {
  switch (kind) {
    case "externalInput":
      return "入力素材";
    case "targetOutput":
      return "出力素材";
    case "disposal":
      return "廃棄素材";
    case "process":
      return "中間素材";
  }
}

function createRecipeInput(materialName = "入力素材"): RecipeInput {
  return {
    id: `input-${crypto.randomUUID()}`,
    material: { kind: "item", name: materialName },
    amountPerRun: 1
  };
}

function createRecipeOutput(materialName = "出力素材"): RecipeOutput {
  return {
    id: `output-${crypto.randomUUID()}`,
    material: { kind: "item", name: materialName },
    amountPerRun: 1,
    probability: 1
  };
}

function updateExternalOptionalFields(
  externalInput: ProjectDocumentV1["line"]["externalInputs"][number],
  maximumFlowPerTick: number | undefined,
  costPerUnit: number | undefined
) {
  return {
    id: externalInput.id,
    material: externalInput.material,
    ...(externalInput.label === undefined ? {} : { label: externalInput.label }),
    ...(maximumFlowPerTick === undefined ? {} : { maximumFlowPerTick }),
    ...(costPerUnit === undefined ? {} : { costPerUnit })
  };
}

function updateProcessOptionalCircuit(
  process: ProjectDocumentV1["line"]["processes"][number],
  circuitNumber: number | undefined
) {
  return {
    id: process.id,
    machineName: process.machineName,
    inputs: process.inputs,
    outputs: process.outputs,
    baseDurationTicks: process.baseDurationTicks,
    basePowerEUt: process.basePowerEUt,
    minimumTier: process.minimumTier,
    operatingTier: process.operatingTier,
    ...(process.label === undefined ? {} : { label: process.label }),
    ...(circuitNumber === undefined ? {} : { circuitNumber })
  };
}

function sameMaterial(left: MaterialRef, right: MaterialRef): boolean {
  return left.kind === right.kind && left.name.trim() === right.name.trim();
}

function parseProcessHandleId(handleId: string | null | undefined, expectedPrefix: string): string | null {
  if (handleId === undefined || handleId === null) {
    return null;
  }

  return handleId.startsWith(`${expectedPrefix}:`) ? handleId.slice(expectedPrefix.length + 1) : null;
}

function inferSourceMaterial(project: ProjectDocumentV1, nodeId: string, sourceHandleId?: string | null) {
  const node = project.editor.nodes.find((candidate) => candidate.id === nodeId);
  if (node === undefined) {
    return null;
  }

  if (node.kind === "externalInput") {
    const external = project.line.externalInputs.find((candidate) => candidate.id === node.entityId);
    if (external === undefined) {
      return null;
    }

    return {
      endpoint: { nodeId, endpointType: "externalInput" } as const,
      material: external.material
    };
  }

  if (node.kind === "process") {
    const process = project.line.processes.find((candidate) => candidate.id === node.entityId);
    const requestedOutputId = parseProcessHandleId(sourceHandleId, "process-output");
    const outputs =
      requestedOutputId === null
        ? process?.outputs
        : process?.outputs.filter((candidate) => candidate.id === requestedOutputId);
    const output = outputs?.[0];
    if (outputs?.length !== 1 || output === undefined) {
      return null;
    }

    return {
      endpoint: {
        nodeId,
        endpointType: "processOutput" as const,
        portId: output.id
      },
      material: output.material
    };
  }

  return null;
}

function inferTargetEndpoint(
  project: ProjectDocumentV1,
  nodeId: string,
  material: MaterialRef,
  targetHandleId?: string | null
) {
  const node = project.editor.nodes.find((candidate) => candidate.id === nodeId);
  if (node === undefined) {
    return null;
  }

  if (node.kind === "targetOutput") {
    const target = project.line.targets.find((candidate) => candidate.id === node.entityId);
    if (target === undefined || !sameMaterial(target.material, material)) {
      return null;
    }

    return {
      endpoint: { nodeId, endpointType: "targetOutput" as const },
      material
    };
  }

  if (node.kind === "disposal") {
    const disposal = project.line.disposals.find((candidate) => candidate.id === node.entityId);
    if (disposal === undefined || !sameMaterial(disposal.material, material)) {
      return null;
    }

    return {
      endpoint: { nodeId, endpointType: "disposal" as const },
      material
    };
  }

  if (node.kind === "process") {
    const process = project.line.processes.find((candidate) => candidate.id === node.entityId);
    if (process === undefined) {
      return null;
    }

    const requestedInputId = parseProcessHandleId(targetHandleId, "process-input");
    const matches = process.inputs.filter(
      (input) =>
        sameMaterial(input.material, material) &&
        (requestedInputId === null || input.id === requestedInputId)
    );
    const match = matches[0];
    if (matches.length !== 1 || match === undefined) {
      return null;
    }

    return {
      endpoint: {
        nodeId,
        endpointType: "processInput" as const,
        portId: match.id
      },
      material
    };
  }

  return null;
}

function buildEdge(
  project: ProjectDocumentV1,
  sourceNodeId: string,
  targetNodeId: string,
  sourceHandleId?: string | null,
  targetHandleId?: string | null,
  excludedEdgeId?: string
): EditorEdge | null {
  const source = inferSourceMaterial(project, sourceNodeId, sourceHandleId);
  if (source === null) {
    return null;
  }

  const target = inferTargetEndpoint(project, targetNodeId, source.material, targetHandleId);
  if (target === null) {
    return null;
  }

  const duplicate = project.editor.edges.find((edge) => {
    if (edge.id === excludedEdgeId) {
      return false;
    }

    const sameSource =
      edge.source.nodeId === source.endpoint.nodeId &&
      edge.source.endpointType === source.endpoint.endpointType &&
      ("portId" in edge.source ? edge.source.portId : undefined) ===
        ("portId" in source.endpoint ? source.endpoint.portId : undefined);
    const sameTarget =
      edge.target.nodeId === target.endpoint.nodeId &&
      edge.target.endpointType === target.endpoint.endpointType &&
      ("portId" in edge.target ? edge.target.portId : undefined) ===
        ("portId" in target.endpoint ? target.endpoint.portId : undefined);
    return sameSource && sameTarget;
  });
  if (duplicate !== undefined) {
    return null;
  }

  return {
    id: `edge-${crypto.randomUUID()}`,
    source: source.endpoint,
    target: target.endpoint,
    material: source.material
  };
}

function isProcessInputEndpoint(endpoint: EditorEdge["target"]): endpoint is Extract<
  EditorEdge["target"],
  { endpointType: "processInput" }
> {
  return endpoint.endpointType === "processInput";
}

function isProcessOutputEndpoint(endpoint: EditorEdge["source"]): endpoint is Extract<
  EditorEdge["source"],
  { endpointType: "processOutput" }
> {
  return endpoint.endpointType === "processOutput";
}

function offsetNodePosition(position: { x: number; y: number }) {
  return {
    x: position.x + 48,
    y: position.y + 48
  };
}

export const useEditorStore = create<EditorStore>()((set) => ({
  calculation: null,
  clipboard: null,
  dirtyRevision: 0,
  project: cloneProject(sampleProject),
  redoStack: [],
  saveErrorMessage: null,
  saveState: "unsaved",
  savedRevision: -1,
  selection: { edgeIds: [], nodeIds: [] },
  undoStack: [],
  addProcessInput(processId) {
    set((state) =>
      mutateProject(state, (project) => {
        project.line.processes = project.line.processes.map((process) =>
          process.id === processId
            ? {
                ...process,
                inputs: [...process.inputs, createRecipeInput(`Input ${String(process.inputs.length + 1)}`)]
              }
            : process
        );
      })
    );
  },
  addProcessOutput(processId) {
    set((state) =>
      mutateProject(state, (project) => {
        project.line.processes = project.line.processes.map((process) =>
          process.id === processId
            ? {
                ...process,
                outputs: [...process.outputs, createRecipeOutput(`Output ${String(process.outputs.length + 1)}`)]
              }
            : process
        );
      })
    );
  },
  clearSelection() {
    set({ selection: { edgeIds: [], nodeIds: [] } });
  },
  copySelection() {
    set((state) => {
      const selectedNodeId = state.selection.nodeIds[0];
      if (selectedNodeId === undefined) {
        return state;
      }

      const node = state.project.editor.nodes.find((candidate) => candidate.id === selectedNodeId);
      if (node === undefined) {
        return state;
      }

      if (node.kind === "process") {
        const process = state.project.line.processes.find((candidate) => candidate.id === node.entityId);
        if (process === undefined) {
          return state;
        }

        return {
          clipboard: {
            kind: "process",
            node: structuredClone(node),
            process: structuredClone(process)
          }
        };
      }

      if (node.kind === "externalInput") {
        const externalInput = state.project.line.externalInputs.find(
          (candidate) => candidate.id === node.entityId
        );
        if (externalInput === undefined) {
          return state;
        }

        return {
          clipboard: {
            kind: "externalInput",
            node: structuredClone(node),
            externalInput: structuredClone(externalInput)
          }
        };
      }

      if (node.kind === "targetOutput") {
        const target = state.project.line.targets.find((candidate) => candidate.id === node.entityId);
        if (target === undefined) {
          return state;
        }

        return {
          clipboard: {
            kind: "targetOutput",
            node: structuredClone(node),
            target: structuredClone(target)
          }
        };
      }

      const disposal = state.project.line.disposals.find((candidate) => candidate.id === node.entityId);
      if (disposal === undefined) {
        return state;
      }

      return {
        clipboard: {
          kind: "disposal",
          node: structuredClone(node),
          disposal: structuredClone(disposal)
        }
      };
    });
  },
  createEdge(sourceNodeId, targetNodeId, sourceHandleId, targetHandleId) {
    set((state) => {
      if (sourceNodeId === null || targetNodeId === null) {
        return state;
      }

      const edge = buildEdge(state.project, sourceNodeId, targetNodeId, sourceHandleId, targetHandleId);
      if (edge === null) {
        return state;
      }

      return mutateProject(state, (project) => {
        project.editor.edges.push(edge);
      });
    });
  },
  createNode(kind) {
    set((state) =>
      mutateProject(state, (project) => {
        const id = crypto.randomUUID();
        const position = makeNodePosition(project.editor.nodes.length);
        const materialName = defaultMaterialName(kind);

        if (kind === "process") {
          const processId = `process-${id}`;
          project.line.processes.push({
            id: processId,
            machineName: "新しいプロセス",
            inputs: [{ ...createRecipeInput(materialName), id: `input-${id}` }],
            outputs: [{ ...createRecipeOutput(materialName), id: `output-${id}` }],
            baseDurationTicks: 20,
            basePowerEUt: 30,
            minimumTier: "LV",
            operatingTier: "LV"
          });
          project.editor.nodes.push({
            id: `node-${id}`,
            kind,
            entityId: processId,
            position
          });
          return;
        }

        if (kind === "externalInput") {
          const externalId = `external-${id}`;
          project.line.externalInputs.push({
            id: externalId,
            label: "新しい外部入力",
            material: { kind: "item", name: materialName }
          });
          project.editor.nodes.push({
            id: `node-${id}`,
            kind,
            entityId: externalId,
            position
          });
          return;
        }

        if (kind === "targetOutput") {
          const targetId = `target-${id}`;
          project.line.targets.push({
            id: targetId,
            label: "新しい目標",
            material: { kind: "item", name: materialName },
            requiredFlowPerTick: 0.05
          });
          project.editor.nodes.push({
            id: `node-${id}`,
            kind,
            entityId: targetId,
            position
          });
          return;
        }

        const disposalId = `disposal-${id}`;
        project.line.disposals.push({
          id: disposalId,
          label: "新しい廃棄先",
          material: { kind: "item", name: materialName }
        });
        project.editor.nodes.push({
          id: `node-${id}`,
          kind,
          entityId: disposalId,
          position
        });
      })
    );
  },
  deleteSelectedNodes() {
    set((state) => {
      const selectedNodeIds = new Set(state.selection.nodeIds);
      const selectedEdgeIds = new Set(state.selection.edgeIds);

      if (selectedNodeIds.size === 0 && selectedEdgeIds.size === 0) {
        return state;
      }

      return {
        ...mutateProject(state, (project) => {
          const selectedNodes = project.editor.nodes.filter((node) => selectedNodeIds.has(node.id));
          const selectedEntityIds = new Set(selectedNodes.map((node) => node.entityId));

          project.editor.nodes = project.editor.nodes.filter((node) => !selectedNodeIds.has(node.id));
          project.editor.edges = project.editor.edges.filter(
            (edge) =>
              !selectedNodeIds.has(edge.source.nodeId) &&
              !selectedNodeIds.has(edge.target.nodeId) &&
              !selectedEdgeIds.has(edge.id)
          );
          project.line.processes = project.line.processes.filter(
            (process) => !selectedEntityIds.has(process.id)
          );
          project.line.externalInputs = project.line.externalInputs.filter(
            (externalInput) => !selectedEntityIds.has(externalInput.id)
          );
          project.line.targets = project.line.targets.filter(
            (target) => !selectedEntityIds.has(target.id)
          );
          project.line.disposals = project.line.disposals.filter(
            (disposal) => !selectedEntityIds.has(disposal.id)
          );
        }),
        selection: { edgeIds: [], nodeIds: [] }
      };
    });
  },
  markCalculation(result) {
    set({ calculation: result });
  },
  markSaveError(message) {
    set({ saveErrorMessage: message, saveState: "saveError" });
  },
  markSaved(updatedAt) {
    set((state) => ({
      project: { ...state.project, updatedAt },
      saveErrorMessage: null,
      saveState: "saved",
      savedRevision: state.dirtyRevision
    }));
  },
  markSaving() {
    set({ saveErrorMessage: null, saveState: "saving" });
  },
  newProject() {
    set({
      calculation: null,
      clipboard: null,
      dirtyRevision: 1,
      project: createEmptyProject(),
      redoStack: [],
      saveErrorMessage: null,
      saveState: "unsaved",
      savedRevision: -1,
      selection: { edgeIds: [], nodeIds: [] },
      undoStack: []
    });
  },
  pasteClipboard() {
    set((state) => {
      if (state.clipboard === null) {
        return state;
      }
      const clipboard = state.clipboard;

      let pastedNodeId = "";

      return {
        ...mutateProject(state, (project) => {
          const position = offsetNodePosition(clipboard.node.position);

          if (clipboard.kind === "process") {
            const processId = `process-${crypto.randomUUID()}`;
            pastedNodeId = `node-${crypto.randomUUID()}`;
            project.line.processes.push({
              ...structuredClone(clipboard.process),
              id: processId,
              machineName: `${clipboard.process.machineName} コピー`,
              inputs: clipboard.process.inputs.map((input) => ({
                ...structuredClone(input),
                id: `input-${crypto.randomUUID()}`
              })),
              outputs: clipboard.process.outputs.map((output) => ({
                ...structuredClone(output),
                id: `output-${crypto.randomUUID()}`
              }))
            });
            project.editor.nodes.push({
              ...structuredClone(clipboard.node),
              id: pastedNodeId,
              entityId: processId,
              position
            });
            return;
          }

          if (clipboard.kind === "externalInput") {
            const externalId = `external-${crypto.randomUUID()}`;
            pastedNodeId = `node-${crypto.randomUUID()}`;
            project.line.externalInputs.push({
              ...structuredClone(clipboard.externalInput),
              id: externalId,
              label: clipboard.externalInput.label
                ? `${clipboard.externalInput.label} コピー`
                : "外部入力 コピー"
            });
            project.editor.nodes.push({
              ...structuredClone(clipboard.node),
              id: pastedNodeId,
              entityId: externalId,
              position
            });
            return;
          }

          if (clipboard.kind === "targetOutput") {
            const targetId = `target-${crypto.randomUUID()}`;
            pastedNodeId = `node-${crypto.randomUUID()}`;
            project.line.targets.push({
              ...structuredClone(clipboard.target),
              id: targetId,
              label: clipboard.target.label
                ? `${clipboard.target.label} コピー`
                : "目標 コピー"
            });
            project.editor.nodes.push({
              ...structuredClone(clipboard.node),
              id: pastedNodeId,
              entityId: targetId,
              position
            });
            return;
          }

          const disposalId = `disposal-${crypto.randomUUID()}`;
          pastedNodeId = `node-${crypto.randomUUID()}`;
          project.line.disposals.push({
            ...structuredClone(clipboard.disposal),
            id: disposalId,
            label: clipboard.disposal.label
              ? `${clipboard.disposal.label} コピー`
              : "廃棄先 コピー"
          });
          project.editor.nodes.push({
            ...structuredClone(clipboard.node),
            id: pastedNodeId,
            entityId: disposalId,
            position
          });
        }),
        selection: { edgeIds: [], nodeIds: pastedNodeId === "" ? [] : [pastedNodeId] }
      };
    });
  },
  moveNode(nodeId, position) {
    set((state) =>
      mutateProject(state, (project) => {
        project.editor.nodes = project.editor.nodes.map((node) =>
          node.id === nodeId ? { ...node, position } : node
        );
      })
    );
  },
  redo() {
    set((state) => {
      const next = state.redoStack.at(-1);

      if (next === undefined) {
        return state;
      }

      return {
        calculation: null,
        dirtyRevision: state.dirtyRevision + 1,
        project: cloneProject(next.project),
        redoStack: state.redoStack.slice(0, -1),
        saveErrorMessage: null,
        saveState: "unsaved",
        selection: { edgeIds: [], nodeIds: [] },
        undoStack: [...state.undoStack, snapshot(state.project)].slice(-100)
      };
    });
  },
  replaceProject(project) {
    set({
      calculation: null,
      clipboard: null,
      dirtyRevision: 0,
      project: cloneProject(project),
      redoStack: [],
      saveErrorMessage: null,
      saveState: "saved",
      savedRevision: 0,
      selection: { edgeIds: [], nodeIds: [] },
      undoStack: []
    });
  },
  selectNode(nodeId) {
    set({
      selection: {
        edgeIds: [],
        nodeIds: nodeId === null ? [] : [nodeId]
      }
    });
  },
  selectEdge(edgeId) {
    set({
      selection: {
        edgeIds: edgeId === null ? [] : [edgeId],
        nodeIds: []
      }
    });
  },
  undo() {
    set((state) => {
      const previous = state.undoStack.at(-1);

      if (previous === undefined) {
        return state;
      }

      return {
        calculation: null,
        dirtyRevision: state.dirtyRevision + 1,
        project: cloneProject(previous.project),
        redoStack: [...state.redoStack, snapshot(state.project)].slice(-100),
        saveErrorMessage: null,
        saveState: "unsaved",
        selection: { edgeIds: [], nodeIds: [] },
        undoStack: state.undoStack.slice(0, -1)
      };
    });
  },
  updateOperatingTier(processId, tier) {
    set((state) =>
      mutateProject(state, (project) => {
        project.line.processes = project.line.processes.map((process) =>
          process.id === processId ? { ...process, operatingTier: tier } : process
        );
      })
    );
  },
  updateDisposalLabel(disposalId, label) {
    set((state) =>
      mutateProject(state, (project) => {
        project.line.disposals = project.line.disposals.map((disposal) =>
          disposal.id === disposalId ? { ...disposal, label } : disposal
        );
      })
    );
  },
  updateExternalLabel(externalId, label) {
    set((state) =>
      mutateProject(state, (project) => {
        project.line.externalInputs = project.line.externalInputs.map((externalInput) =>
          externalInput.id === externalId ? { ...externalInput, label } : externalInput
        );
      })
    );
  },
  updateExternalLimits(externalId, maximumFlowPerTick, costPerUnit) {
    set((state) =>
      mutateProject(state, (project) => {
        project.line.externalInputs = project.line.externalInputs.map((externalInput) =>
          externalInput.id === externalId
            ? updateExternalOptionalFields(externalInput, maximumFlowPerTick, costPerUnit)
            : externalInput
        );
      })
    );
  },
  updateMaterialName(entityId, nodeKind, name) {
    set((state) =>
      mutateProject(state, (project) => {
        if (nodeKind === "process") {
          return;
        }

        project.line.externalInputs = project.line.externalInputs.map((externalInput) =>
          externalInput.id === entityId
            ? { ...externalInput, material: { ...externalInput.material, name } }
            : externalInput
        );
        project.line.targets = project.line.targets.map((target) =>
          target.id === entityId ? { ...target, material: { ...target.material, name } } : target
        );
        project.line.disposals = project.line.disposals.map((disposal) =>
          disposal.id === entityId ? { ...disposal, material: { ...disposal.material, name } } : disposal
        );
      })
    );
  },
  updateProcessCircuitNumber(processId, circuitNumber) {
    set((state) =>
      mutateProject(state, (project) => {
        project.line.processes = project.line.processes.map((process) =>
          process.id === processId ? updateProcessOptionalCircuit(process, circuitNumber) : process
        );
      })
    );
  },
  updateProcessInput(processId, inputId, input) {
    set((state) =>
      mutateProject(state, (project) => {
        project.line.processes = project.line.processes.map((process) =>
          process.id === processId
            ? {
                ...process,
                inputs: process.inputs.map((candidate) => (candidate.id === inputId ? input : candidate))
              }
            : process
        );
      })
    );
  },
  updateProcessMachineName(processId, machineName) {
    set((state) =>
      mutateProject(state, (project) => {
        project.line.processes = project.line.processes.map((process) =>
          process.id === processId ? { ...process, machineName } : process
        );
      })
    );
  },
  updateProcessMetrics(processId, baseDurationTicks, basePowerEUt) {
    set((state) =>
      mutateProject(state, (project) => {
        project.line.processes = project.line.processes.map((process) =>
          process.id === processId
            ? { ...process, baseDurationTicks, basePowerEUt }
            : process
        );
      })
    );
  },
  updateProcessMinimumTier(processId, tier) {
    set((state) =>
      mutateProject(state, (project) => {
        project.line.processes = project.line.processes.map((process) =>
          process.id === processId ? { ...process, minimumTier: tier } : process
        );
      })
    );
  },
  updateProcessOutput(processId, outputId, output) {
    set((state) =>
      mutateProject(state, (project) => {
        project.line.processes = project.line.processes.map((process) =>
          process.id === processId
            ? {
                ...process,
                outputs: process.outputs.map((candidate) => (candidate.id === outputId ? output : candidate))
              }
            : process
        );
      })
    );
  },
  updateProjectName(name) {
    set((state) =>
      mutateProject(state, (project) => {
        project.name = name;
        project.line.name = name;
      })
    );
  },
  updateTargetDetails(targetId, label, requiredFlowPerTick) {
    set((state) =>
      mutateProject(state, (project) => {
        project.line.targets = project.line.targets.map((target) =>
          target.id === targetId ? { ...target, label, requiredFlowPerTick } : target
        );
      })
    );
  },
  updateTargetLabel(targetId, label) {
    set((state) =>
      mutateProject(state, (project) => {
        project.line.targets = project.line.targets.map((target) =>
          target.id === targetId ? { ...target, label } : target
        );
      })
    );
  },
  updateTargetFlow(targetId, requiredFlowPerTick) {
    set((state) =>
      mutateProject(state, (project) => {
        project.line.targets = project.line.targets.map((target) =>
          target.id === targetId ? { ...target, requiredFlowPerTick } : target
        );
      })
    );
  },
  updateViewport(viewport) {
    set((state) =>
      mutateProject(state, (project) => {
        project.editor.viewport = viewport;
      })
    );
  },
  updateEdge(edgeId, sourceNodeId, targetNodeId, sourceHandleId, targetHandleId) {
    set((state) => {
      if (sourceNodeId === null || targetNodeId === null) {
        return state;
      }

      const existingEdge = state.project.editor.edges.find((edge) => edge.id === edgeId);
      if (existingEdge === undefined) {
        return state;
      }

      const replacement = buildEdge(
        state.project,
        sourceNodeId,
        targetNodeId,
        sourceHandleId,
        targetHandleId,
        edgeId
      );
      if (replacement === null) {
        return state;
      }

      return mutateProject(state, (project) => {
        project.editor.edges = project.editor.edges.map((edge) =>
          edge.id === edgeId ? { ...replacement, id: edgeId } : edge
        );
      });
    });
  },
  removeProcessInput(processId, inputId) {
    set((state) =>
      mutateProject(state, (project) => {
        project.line.processes = project.line.processes.map((process) =>
          process.id === processId
            ? {
                ...process,
                inputs:
                  process.inputs.length > 1
                    ? process.inputs.filter((input) => input.id !== inputId)
                    : process.inputs
              }
            : process
        );
        project.editor.edges = project.editor.edges.filter(
          (edge) => !isProcessInputEndpoint(edge.target) || edge.target.portId !== inputId
        );
      })
    );
  },
  removeProcessOutput(processId, outputId) {
    set((state) =>
      mutateProject(state, (project) => {
        project.line.processes = project.line.processes.map((process) =>
          process.id === processId
            ? {
                ...process,
                outputs:
                  process.outputs.length > 1
                    ? process.outputs.filter((output) => output.id !== outputId)
                    : process.outputs
              }
            : process
        );
        project.editor.edges = project.editor.edges.filter(
          (edge) => !isProcessOutputEndpoint(edge.source) || edge.source.portId !== outputId
        );
      })
    );
  }
}));

import { ReactFlowProvider } from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CalculationResult,
  RecipeInput,
  RecipeOutput,
  VoltageTier
} from "../../domain/production-line/types";
import { CalculationClient } from "../../workers/calculation-client";
import { compileMaterialNetworks } from "./compiler/compileMaterialNetworks";
import { EditorSidebar } from "./EditorSidebar";
import { EditorToolbar } from "./EditorToolbar";
import { useProjectPersistence } from "./hooks/useProjectPersistence";
import { ProductionLineCanvas } from "./ProductionLineCanvas";
import { useEditorStore } from "./store/editorStore";

export function EditorScreen() {
  const [calculation, setCalculation] = useState<CalculationResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const latestRequestIdRef = useRef<string | null>(null);
  const calculationClient = useMemo(() => new CalculationClient(), []);
  const project = useEditorStore((state) => state.project);
  const selectedNodeId = useEditorStore((state) => state.selection.nodeIds[0] ?? null);
  const selection = useEditorStore((state) => state.selection);
  const editorStore = useEditorStore();
  const { exportCurrentProject, importProject, saveErrorMessage, saveState } = useProjectPersistence();
  const compiled = useMemo(
    () => compileMaterialNetworks(project.line, project.editor),
    [project]
  );

  useEffect(() => {
    return () => {
      calculationClient.dispose();
    };
  }, [calculationClient]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
        event.preventDefault();
        editorStore.copySelection();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
        event.preventDefault();
        editorStore.pasteClipboard();
        return;
      }

      if (event.key === "Delete") {
        event.preventDefault();
        editorStore.deleteSelectedNodes();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [editorStore]);

  async function handleCalculate() {
    if (compiled.line === undefined) {
      return;
    }

    setIsCalculating(true);

    try {
      const { requestId, result } = await calculationClient.calculate(compiled.line);
      latestRequestIdRef.current = requestId;
      setCalculation((current) =>
        latestRequestIdRef.current === requestId || current === null ? result : current
      );
      editorStore.markCalculation(result);
    } catch {
      const result = {
        status: "invalid",
        processes: [],
        networks: [],
        power: { averageEUt: 0, maximumEUt: 0 },
        diagnostics: [
          {
            code: "WORKER_ERROR",
            severity: "error",
            message: "Calculation worker failed.",
            entityIds: []
          }
        ]
      } satisfies CalculationResult;
      setCalculation(result);
      editorStore.markCalculation(result);
    } finally {
      setIsCalculating(false);
    }
  }

  return (
    <div className="editor-layout">
      <EditorToolbar
        canDeleteSelection={selection.edgeIds.length > 0 || selection.nodeIds.length > 0}
        isCalculating={isCalculating}
        onCalculate={() => {
          void handleCalculate();
        }}
        onCreateNode={(kind) => {
          editorStore.createNode(kind);
        }}
        onDeleteSelected={() => {
          editorStore.deleteSelectedNodes();
        }}
        onExport={() => {
          exportCurrentProject();
        }}
        onImport={(file) => {
          void importProject(file);
        }}
        onNewProject={() => {
          editorStore.newProject();
        }}
        onProjectNameChange={(name) => {
          editorStore.updateProjectName(name);
        }}
        onRedo={() => {
          editorStore.redo();
        }}
        onUndo={() => {
          editorStore.undo();
        }}
        projectName={project.name}
        saveState={saveState}
      />
      <div className="editor-grid">
        <section className="panel canvas-panel">
          <ReactFlowProvider>
            <ProductionLineCanvas project={project} />
          </ReactFlowProvider>
        </section>
        <aside className="panel sidebar">
          <EditorSidebar
            calculation={calculation}
            onAddProcessInput={(processId) => {
              editorStore.addProcessInput(processId);
            }}
            onAddProcessOutput={(processId) => {
              editorStore.addProcessOutput(processId);
            }}
            onRemoveProcessInput={(processId, inputId) => {
              editorStore.removeProcessInput(processId, inputId);
            }}
            onRemoveProcessOutput={(processId, outputId) => {
              editorStore.removeProcessOutput(processId, outputId);
            }}
            onSelectedCircuitNumberChange={(circuitNumber) => {
              if (selectedNodeId === null) {
                return;
              }

              const selectedNode =
                project.editor.nodes.find((candidate) => candidate.id === selectedNodeId) ?? null;
              if (selectedNode?.kind === "process") {
                editorStore.updateProcessCircuitNumber(selectedNode.entityId, circuitNumber);
              }
            }}
            onSelectedDisposalLabelChange={(label) => {
              if (selectedNodeId === null) {
                return;
              }

              const selectedNode =
                project.editor.nodes.find((candidate) => candidate.id === selectedNodeId) ?? null;
              if (selectedNode?.kind === "disposal") {
                editorStore.updateDisposalLabel(selectedNode.entityId, label);
              }
            }}
            onSelectedExternalLimitsChange={(maximumFlowPerTick, costPerUnit) => {
              if (selectedNodeId === null) {
                return;
              }

              const selectedNode =
                project.editor.nodes.find((candidate) => candidate.id === selectedNodeId) ?? null;
              if (selectedNode?.kind === "externalInput") {
                editorStore.updateExternalLimits(
                  selectedNode.entityId,
                  maximumFlowPerTick,
                  costPerUnit
                );
              }
            }}
            onSelectedLabelChange={(label) => {
              if (selectedNodeId === null) {
                return;
              }

              const selectedNode =
                project.editor.nodes.find((candidate) => candidate.id === selectedNodeId) ?? null;
              if (selectedNode?.kind === "externalInput") {
                editorStore.updateExternalLabel(selectedNode.entityId, label);
              }
              if (selectedNode?.kind === "targetOutput") {
                editorStore.updateTargetLabel(selectedNode.entityId, label);
              }
            }}
            onSelectedMachineNameChange={(machineName) => {
              if (selectedNodeId === null) {
                return;
              }

              const selectedNode =
                project.editor.nodes.find((candidate) => candidate.id === selectedNodeId) ?? null;
              if (selectedNode?.kind === "process") {
                editorStore.updateProcessMachineName(selectedNode.entityId, machineName);
              }
            }}
            onSelectedMaterialNameChange={(name) => {
              if (selectedNodeId === null) {
                return;
              }

              const selectedNode =
                project.editor.nodes.find((candidate) => candidate.id === selectedNodeId) ?? null;
              if (selectedNode !== null && selectedNode.kind !== "process") {
                editorStore.updateMaterialName(selectedNode.entityId, selectedNode.kind, name);
              }
            }}
            onSelectedMetricsChange={(baseDurationTicks, basePowerEUt) => {
              if (selectedNodeId === null) {
                return;
              }

              const selectedNode =
                project.editor.nodes.find((candidate) => candidate.id === selectedNodeId) ?? null;
              if (selectedNode?.kind === "process") {
                editorStore.updateProcessMetrics(
                  selectedNode.entityId,
                  baseDurationTicks,
                  basePowerEUt
                );
              }
            }}
            onSelectedMinimumTierChange={(tier) => {
              if (selectedNodeId === null) {
                return;
              }

              const selectedNode =
                project.editor.nodes.find((candidate) => candidate.id === selectedNodeId) ?? null;
              if (selectedNode?.kind === "process") {
                editorStore.updateProcessMinimumTier(selectedNode.entityId, tier);
              }
            }}
            onSelectedProcessInputChange={(inputId, input: RecipeInput) => {
              if (selectedNodeId === null) {
                return;
              }

              const selectedNode =
                project.editor.nodes.find((candidate) => candidate.id === selectedNodeId) ?? null;
              if (selectedNode?.kind === "process") {
                editorStore.updateProcessInput(selectedNode.entityId, inputId, input);
              }
            }}
            onSelectedProcessOutputChange={(outputId, output: RecipeOutput) => {
              if (selectedNodeId === null) {
                return;
              }

              const selectedNode =
                project.editor.nodes.find((candidate) => candidate.id === selectedNodeId) ?? null;
              if (selectedNode?.kind === "process") {
                editorStore.updateProcessOutput(selectedNode.entityId, outputId, output);
              }
            }}
            onSelectedTargetDetailsChange={(label, requiredFlowPerTick) => {
              if (selectedNodeId === null) {
                return;
              }

              const selectedNode =
                project.editor.nodes.find((candidate) => candidate.id === selectedNodeId) ?? null;
              if (selectedNode?.kind === "targetOutput") {
                editorStore.updateTargetDetails(selectedNode.entityId, label, requiredFlowPerTick);
              }
            }}
            onTargetFlowChange={(targetId, requiredFlowPerTick) => {
              editorStore.updateTargetFlow(targetId, requiredFlowPerTick);
            }}
            onTierChange={(processId, tier: VoltageTier) => {
              editorStore.updateOperatingTier(processId, tier);
            }}
            project={project}
            saveErrorMessage={saveErrorMessage}
            selectedNodeId={selectedNodeId}
          />
        </aside>
      </div>
    </div>
  );
}

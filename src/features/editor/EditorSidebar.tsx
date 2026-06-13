import { useMemo, useState } from "react";
import type {
  CalculationResult,
  Diagnostic,
  EditorEndpoint,
  ProjectDocumentV1,
  RecipeInput,
  RecipeOutput,
  VoltageTier
} from "../../domain/production-line/types";
import { TIER_ORDER } from "../../domain/production-line/types";

interface EditorSidebarProps {
  calculation: CalculationResult | null;
  diagnostics: Diagnostic[];
  onAddProcessInput: (processId: string) => void;
  onAddProcessOutput: (processId: string) => void;
  onRemoveProcessInput: (processId: string, inputId: string) => void;
  onRemoveProcessOutput: (processId: string, outputId: string) => void;
  onSelectedCircuitNumberChange: (circuitNumber: number | undefined) => void;
  onSelectedDisposalLabelChange: (label: string) => void;
  onSelectedExternalLimitsChange: (
    maximumFlowPerTick: number | undefined,
    costPerUnit: number | undefined
  ) => void;
  onSelectedLabelChange: (label: string) => void;
  onSelectedMachineNameChange: (machineName: string) => void;
  onSelectedMaterialNameChange: (name: string) => void;
  onSelectedMetricsChange: (baseDurationTicks: number, basePowerEUt: number) => void;
  onSelectedMinimumTierChange: (tier: VoltageTier) => void;
  onSelectedProcessInputChange: (inputId: string, input: RecipeInput) => void;
  onSelectedProcessOutputChange: (outputId: string, output: RecipeOutput) => void;
  onSelectedTargetDetailsChange: (label: string, requiredFlowPerTick: number) => void;
  onSelectedEdgeChange: (
    edgeId: string,
    sourceNodeId: string | null,
    targetNodeId: string | null,
    sourceHandleId?: string | null,
    targetHandleId?: string | null
  ) => void;
  onTargetFlowChange: (targetId: string, requiredFlowPerTick: number) => void;
  onTierChange: (processId: string, tier: VoltageTier) => void;
  project: ProjectDocumentV1;
  saveErrorMessage: string | null;
  selectedEdgeId: string | null;
  selectedNodeId: string | null;
}

function formatFlowPerSecond(flowPerTick: number): string {
  return `${(flowPerTick * 20).toFixed(2)}/s`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatResidual(value: number): string {
  return value.toFixed(6);
}

function parseOptionalNumber(value: string): number | undefined {
  if (value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function EditorSidebar({
  calculation,
  diagnostics,
  onAddProcessInput,
  onAddProcessOutput,
  onRemoveProcessInput,
  onRemoveProcessOutput,
  onSelectedCircuitNumberChange,
  onSelectedDisposalLabelChange,
  onSelectedExternalLimitsChange,
  onSelectedLabelChange,
  onSelectedMachineNameChange,
  onSelectedMaterialNameChange,
  onSelectedMetricsChange,
  onSelectedMinimumTierChange,
  onSelectedProcessInputChange,
  onSelectedProcessOutputChange,
  onSelectedTargetDetailsChange,
  onSelectedEdgeChange,
  onTargetFlowChange,
  onTierChange,
  project,
  saveErrorMessage,
  selectedEdgeId,
  selectedNodeId
}: EditorSidebarProps) {
  const selectedNode =
    selectedNodeId === null
      ? null
      : project.editor.nodes.find((candidate) => candidate.id === selectedNodeId) ?? null;
  const selectedProcess =
    selectedNode?.kind === "process"
      ? project.line.processes.find((candidate) => candidate.id === selectedNode.entityId) ?? null
      : null;
  const selectedExternal =
    selectedNode?.kind === "externalInput"
      ? project.line.externalInputs.find((candidate) => candidate.id === selectedNode.entityId) ?? null
      : null;
  const selectedTarget =
    selectedNode?.kind === "targetOutput"
      ? project.line.targets.find((candidate) => candidate.id === selectedNode.entityId) ?? null
      : null;
  const selectedDisposal =
    selectedNode?.kind === "disposal"
      ? project.line.disposals.find((candidate) => candidate.id === selectedNode.entityId) ?? null
      : null;
  const selectedEdge =
    selectedEdgeId === null
      ? null
      : project.editor.edges.find((candidate) => candidate.id === selectedEdgeId) ?? null;
  const [edgeDraftState, setEdgeDraftState] = useState<{
    edgeId: string | null;
    sourceHandleId: string | null;
    sourceNodeId: string | null;
    targetHandleId: string | null;
    targetNodeId: string | null;
  }>({
    edgeId: null,
    sourceHandleId: null,
    sourceNodeId: null,
    targetHandleId: null,
    targetNodeId: null
  });

  function describeNode(nodeId: string): string {
    const node = project.editor.nodes.find((candidate) => candidate.id === nodeId);
    if (node === undefined) {
      return nodeId;
    }

    switch (node.kind) {
      case "process":
        return (
          project.line.processes.find((candidate) => candidate.id === node.entityId)?.machineName ??
          node.entityId
        );
      case "externalInput":
        return (
          project.line.externalInputs.find((candidate) => candidate.id === node.entityId)?.label ??
          node.entityId
        );
      case "targetOutput":
        return (
          project.line.targets.find((candidate) => candidate.id === node.entityId)?.label ??
          node.entityId
        );
      case "disposal":
        return (
          project.line.disposals.find((candidate) => candidate.id === node.entityId)?.label ??
          node.entityId
        );
    }
  }

  function describeEndpointPort(direction: "source" | "target", endpoint: EditorEndpoint) {
    if (!("portId" in endpoint)) {
      return endpoint.endpointType;
    }

    for (const process of project.line.processes) {
      const input = process.inputs.find((candidate) => candidate.id === endpoint.portId);
      if (input !== undefined) {
        return `${direction}:${input.material.name}`;
      }

      const output = process.outputs.find((candidate) => candidate.id === endpoint.portId);
      if (output !== undefined) {
        return `${direction}:${output.material.name}`;
      }
    }

    return `${direction}:${endpoint.portId}`;
  }

  function handleIdFromEndpoint(endpoint: EditorEndpoint): string | null {
    if (endpoint.endpointType === "processInput") {
      return `process-input:${endpoint.portId}`;
    }
    if (endpoint.endpointType === "processOutput") {
      return `process-output:${endpoint.portId}`;
    }
    if (endpoint.endpointType === "externalInput") {
      return "external-output";
    }
    if (endpoint.endpointType === "targetOutput") {
      return "target-input";
    }
    return "disposal-input";
  }

  function listPorts(nodeId: string | null, direction: "source" | "target") {
    if (nodeId === null) {
      return [];
    }

    const node = project.editor.nodes.find((candidate) => candidate.id === nodeId);
    if (node === undefined) {
      return [];
    }

    if (direction === "source") {
      if (node.kind === "externalInput") {
        const external = project.line.externalInputs.find((candidate) => candidate.id === node.entityId);
        return external === undefined
          ? []
          : [{ label: external.material.name, value: "external-output" }];
      }

      if (node.kind === "process") {
        const process = project.line.processes.find((candidate) => candidate.id === node.entityId);
        return (
          process?.outputs.map((output) => ({
            label: `${output.material.name} (${String(output.amountPerRun)})`,
            value: `process-output:${output.id}`
          })) ?? []
        );
      }

      return [];
    }

    if (node.kind === "process") {
      const process = project.line.processes.find((candidate) => candidate.id === node.entityId);
      return (
        process?.inputs.map((input) => ({
          label: `${input.material.name} (${String(input.amountPerRun)})`,
          value: `process-input:${input.id}`
        })) ?? []
      );
    }

    if (node.kind === "targetOutput") {
      const target = project.line.targets.find((candidate) => candidate.id === node.entityId);
      return target === undefined ? [] : [{ label: target.material.name, value: "target-input" }];
    }

    if (node.kind === "disposal") {
      const disposal = project.line.disposals.find((candidate) => candidate.id === node.entityId);
      return disposal === undefined ? [] : [{ label: disposal.material.name, value: "disposal-input" }];
    }

    return [];
  }

  const sourceNodeOptions = useMemo(
    () =>
      project.editor.nodes.filter((candidate) =>
        candidate.kind === "externalInput" || candidate.kind === "process"
      ),
    [project.editor.nodes]
  );
  const targetNodeOptions = useMemo(
    () =>
      project.editor.nodes.filter((candidate) =>
        candidate.kind === "process" ||
        candidate.kind === "targetOutput" ||
        candidate.kind === "disposal"
      ),
    [project.editor.nodes]
  );
  const derivedEdgeDraft =
    selectedEdge === null
      ? {
          edgeId: null,
          sourceHandleId: null,
          sourceNodeId: null,
          targetHandleId: null,
          targetNodeId: null
        }
      : {
          edgeId: selectedEdge.id,
          sourceHandleId: handleIdFromEndpoint(selectedEdge.source),
          sourceNodeId: selectedEdge.source.nodeId,
          targetHandleId: handleIdFromEndpoint(selectedEdge.target),
          targetNodeId: selectedEdge.target.nodeId
        };
  const edgeDraft =
    edgeDraftState.edgeId === derivedEdgeDraft.edgeId ? edgeDraftState : derivedEdgeDraft;
  const sourcePortOptions = listPorts(edgeDraft.sourceNodeId, "source");
  const targetPortOptions = listPorts(edgeDraft.targetNodeId, "target");
  const selectedNodeKindLabel =
    selectedNode?.kind === "process"
      ? "プロセス"
      : selectedNode?.kind === "externalInput"
        ? "外部入力"
        : selectedNode?.kind === "targetOutput"
          ? "目標"
          : selectedNode?.kind === "disposal"
            ? "廃棄先"
            : "";

  return (
    <>
      {saveErrorMessage === null ? null : (
        <p className="error-banner" data-testid="save-error-message">
          {saveErrorMessage}
        </p>
      )}

      <section className="sidebar-section">
        <span className="sidebar-label">選択中の項目</span>
        {selectedNode === null ? (
          selectedEdgeId === null ? (
            <p className="sidebar-metric">ノードまたは接続を選択してください。</p>
          ) : (
            selectedEdge === null ? (
              <p className="sidebar-metric">接続を選択中: {selectedEdgeId}</p>
            ) : (
              <>
                <p className="sidebar-metric">接続</p>
                <p className="sidebar-metric">
                  {describeNode(selectedEdge.source.nodeId)} {"->"} {describeNode(selectedEdge.target.nodeId)}
                </p>
                <p className="sidebar-metric">素材: {selectedEdge.material.name}</p>
                <p className="sidebar-metric">
                  出力ポート: {describeEndpointPort("source", selectedEdge.source)}
                </p>
                <p className="sidebar-metric">
                  入力ポート: {describeEndpointPort("target", selectedEdge.target)}
                </p>
                <label className="field-label">
                  出力ノード
                  <select
                    className="field-input"
                    onChange={(event) => {
                      const nextNodeId = event.target.value;
                      const nextPorts = listPorts(nextNodeId, "source");
                      setEdgeDraftState((current) => ({
                        ...current,
                        edgeId: selectedEdge.id,
                        sourceNodeId: nextNodeId,
                        sourceHandleId: nextPorts[0]?.value ?? null
                      }));
                    }}
                    value={edgeDraft.sourceNodeId ?? ""}
                  >
                    {sourceNodeOptions.map((node) => (
                      <option key={node.id} value={node.id}>
                        {describeNode(node.id)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  出力ポート
                  <select
                    className="field-input"
                    onChange={(event) => {
                      setEdgeDraftState((current) => ({
                        ...current,
                        edgeId: selectedEdge.id,
                        sourceHandleId: event.target.value
                      }));
                    }}
                    value={edgeDraft.sourceHandleId ?? ""}
                  >
                    {sourcePortOptions.map((port) => (
                      <option key={port.value} value={port.value}>
                        {port.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  入力ノード
                  <select
                    className="field-input"
                    onChange={(event) => {
                      const nextNodeId = event.target.value;
                      const nextPorts = listPorts(nextNodeId, "target");
                      setEdgeDraftState((current) => ({
                        ...current,
                        edgeId: selectedEdge.id,
                        targetNodeId: nextNodeId,
                        targetHandleId: nextPorts[0]?.value ?? null
                      }));
                    }}
                    value={edgeDraft.targetNodeId ?? ""}
                  >
                    {targetNodeOptions.map((node) => (
                      <option key={node.id} value={node.id}>
                        {describeNode(node.id)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  入力ポート
                  <select
                    className="field-input"
                    onChange={(event) => {
                      setEdgeDraftState((current) => ({
                        ...current,
                        edgeId: selectedEdge.id,
                        targetHandleId: event.target.value
                      }));
                    }}
                    value={edgeDraft.targetHandleId ?? ""}
                  >
                    {targetPortOptions.map((port) => (
                      <option key={port.value} value={port.value}>
                        {port.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="button-row">
                  <button
                    className="secondary-button compact-button"
                    onClick={() => {
                      onSelectedEdgeChange(
                        selectedEdge.id,
                        edgeDraft.sourceNodeId,
                        edgeDraft.targetNodeId,
                        edgeDraft.sourceHandleId,
                        edgeDraft.targetHandleId
                      );
                    }}
                    type="button"
                  >
                    接続を更新
                  </button>
                </div>
              </>
            )
          )
        ) : (
          <>
            <p className="sidebar-metric">{selectedNodeKindLabel}</p>
            {selectedProcess !== null ? (
              <>
                <label className="field-label">
                  設備名
                  <input
                    className="field-input"
                    onChange={(event) => {
                      onSelectedMachineNameChange(event.target.value);
                    }}
                    type="text"
                    value={selectedProcess.machineName}
                  />
                </label>
                <label className="field-label">
                  基本処理時間 (t)
                  <input
                    className="field-input"
                    min="1"
                    onChange={(event) => {
                      const duration = Number(event.target.value);
                      if (Number.isFinite(duration) && duration > 0) {
                        onSelectedMetricsChange(duration, selectedProcess.basePowerEUt);
                      }
                    }}
                    type="number"
                    value={selectedProcess.baseDurationTicks}
                  />
                </label>
                <label className="field-label">
                  Base EU/t
                  <input
                    className="field-input"
                    min="0"
                    onChange={(event) => {
                      const power = Number(event.target.value);
                      if (Number.isFinite(power) && power >= 0) {
                        onSelectedMetricsChange(selectedProcess.baseDurationTicks, power);
                      }
                    }}
                    type="number"
                    value={selectedProcess.basePowerEUt}
                  />
                </label>
                <label className="field-label">
                  Minimum tier
                  <select
                    className="field-input"
                    onChange={(event) => {
                      onSelectedMinimumTierChange(event.target.value as VoltageTier);
                    }}
                    value={selectedProcess.minimumTier}
                  >
                    {TIER_ORDER.map((tier) => (
                      <option key={tier} value={tier}>
                        {tier}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  回路番号
                  <input
                    className="field-input"
                    min="0"
                    onChange={(event) => {
                      onSelectedCircuitNumberChange(parseOptionalNumber(event.target.value));
                    }}
                    placeholder="Optional"
                    type="number"
                    value={selectedProcess.circuitNumber ?? ""}
                  />
                </label>
                <div className="recipe-section">
                  <div className="recipe-section__header">
                    <strong>入力</strong>
                    <button
                      className="secondary-button compact-button"
                      onClick={() => {
                        onAddProcessInput(selectedProcess.id);
                      }}
                      type="button"
                    >
                      入力追加
                    </button>
                  </div>
                  {selectedProcess.inputs.map((input) => (
                    <div className="recipe-row" key={input.id}>
                      <label className="field-label">
                        素材
                        <input
                          className="field-input"
                          onChange={(event) => {
                            onSelectedProcessInputChange(input.id, {
                              ...input,
                              material: { ...input.material, name: event.target.value }
                            });
                          }}
                          type="text"
                          value={input.material.name}
                        />
                      </label>
                      <label className="field-label">
                        種別
                        <select
                          className="field-input"
                          onChange={(event) => {
                            onSelectedProcessInputChange(input.id, {
                              ...input,
                              material: {
                                ...input.material,
                                kind: event.target.value as RecipeInput["material"]["kind"]
                              }
                            });
                          }}
                          value={input.material.kind}
                        >
                          <option value="item">アイテム</option>
                          <option value="fluid">流体</option>
                        </select>
                      </label>
                      <label className="field-label">
                        1レシピ量
                        <input
                          className="field-input"
                          min="0"
                          onChange={(event) => {
                            const amountPerRun = Number(event.target.value);
                            if (Number.isFinite(amountPerRun) && amountPerRun >= 0) {
                              onSelectedProcessInputChange(input.id, { ...input, amountPerRun });
                            }
                          }}
                          step="0.01"
                          type="number"
                          value={input.amountPerRun}
                        />
                      </label>
                      <button
                        className="secondary-button compact-button"
                        disabled={selectedProcess.inputs.length <= 1}
                        onClick={() => {
                          onRemoveProcessInput(selectedProcess.id, input.id);
                        }}
                        type="button"
                      >
                        削除
                      </button>
                    </div>
                  ))}
                </div>
                <div className="recipe-section">
                  <div className="recipe-section__header">
                    <strong>出力</strong>
                    <button
                      className="secondary-button compact-button"
                      onClick={() => {
                        onAddProcessOutput(selectedProcess.id);
                      }}
                      type="button"
                    >
                      出力追加
                    </button>
                  </div>
                  {selectedProcess.outputs.map((output) => (
                    <div className="recipe-row" key={output.id}>
                      <label className="field-label">
                        素材
                        <input
                          className="field-input"
                          onChange={(event) => {
                            onSelectedProcessOutputChange(output.id, {
                              ...output,
                              material: { ...output.material, name: event.target.value }
                            });
                          }}
                          type="text"
                          value={output.material.name}
                        />
                      </label>
                      <label className="field-label">
                        種別
                        <select
                          className="field-input"
                          onChange={(event) => {
                            onSelectedProcessOutputChange(output.id, {
                              ...output,
                              material: {
                                ...output.material,
                                kind: event.target.value as RecipeOutput["material"]["kind"]
                              }
                            });
                          }}
                          value={output.material.kind}
                        >
                          <option value="item">アイテム</option>
                          <option value="fluid">流体</option>
                        </select>
                      </label>
                      <label className="field-label">
                        1レシピ量
                        <input
                          className="field-input"
                          min="0"
                          onChange={(event) => {
                            const amountPerRun = Number(event.target.value);
                            if (Number.isFinite(amountPerRun) && amountPerRun >= 0) {
                              onSelectedProcessOutputChange(output.id, { ...output, amountPerRun });
                            }
                          }}
                          step="0.01"
                          type="number"
                          value={output.amountPerRun}
                        />
                      </label>
                      <label className="field-label">
                        確率
                        <input
                          className="field-input"
                          max="1"
                          min="0"
                          onChange={(event) => {
                            const probability = Number(event.target.value);
                            if (Number.isFinite(probability) && probability >= 0 && probability <= 1) {
                              onSelectedProcessOutputChange(output.id, { ...output, probability });
                            }
                          }}
                          step="0.01"
                          type="number"
                          value={output.probability ?? 1}
                        />
                      </label>
                      <button
                        className="secondary-button compact-button"
                        disabled={selectedProcess.outputs.length <= 1}
                        onClick={() => {
                          onRemoveProcessOutput(selectedProcess.id, output.id);
                        }}
                        type="button"
                      >
                        削除
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
            {selectedExternal !== null ? (
              <>
                <label className="field-label">
                  ラベル
                  <input
                    className="field-input"
                    onChange={(event) => {
                      onSelectedLabelChange(event.target.value);
                    }}
                    type="text"
                    value={selectedExternal.label ?? ""}
                  />
                </label>
                <label className="field-label">
                  素材
                  <input
                    className="field-input"
                    onChange={(event) => {
                      onSelectedMaterialNameChange(event.target.value);
                    }}
                    type="text"
                    value={selectedExternal.material.name}
                  />
                </label>
                <label className="field-label">
                  最大流量 / tick
                  <input
                    className="field-input"
                    min="0"
                    onChange={(event) => {
                      onSelectedExternalLimitsChange(
                        parseOptionalNumber(event.target.value),
                        selectedExternal.costPerUnit
                      );
                    }}
                    placeholder="無制限"
                    step="0.01"
                    type="number"
                    value={selectedExternal.maximumFlowPerTick ?? ""}
                  />
                </label>
                <label className="field-label">
                  コスト / unit
                  <input
                    className="field-input"
                    min="0"
                    onChange={(event) => {
                      onSelectedExternalLimitsChange(
                        selectedExternal.maximumFlowPerTick,
                        parseOptionalNumber(event.target.value)
                      );
                    }}
                    placeholder="任意"
                    step="0.01"
                    type="number"
                    value={selectedExternal.costPerUnit ?? ""}
                  />
                </label>
              </>
            ) : null}
            {selectedTarget !== null ? (
              <>
                <label className="field-label">
                  ラベル
                  <input
                    className="field-input"
                    onChange={(event) => {
                      onSelectedLabelChange(event.target.value);
                    }}
                    type="text"
                    value={selectedTarget.label ?? ""}
                  />
                </label>
                <label className="field-label">
                  素材
                  <input
                    className="field-input"
                    onChange={(event) => {
                      onSelectedMaterialNameChange(event.target.value);
                    }}
                    type="text"
                    value={selectedTarget.material.name}
                  />
                </label>
                <label className="field-label">
                  秒間流量
                  <input
                    className="field-input"
                    min="0.01"
                    onChange={(event) => {
                      const requiredFlowPerTick = Number(event.target.value) / 20;
                      if (Number.isFinite(requiredFlowPerTick) && requiredFlowPerTick > 0) {
                        onSelectedTargetDetailsChange(selectedTarget.label ?? "", requiredFlowPerTick);
                      }
                    }}
                    step="0.01"
                    type="number"
                    value={(selectedTarget.requiredFlowPerTick * 20).toFixed(2)}
                  />
                </label>
              </>
            ) : null}
            {selectedDisposal !== null ? (
              <>
                <label className="field-label">
                  ラベル
                  <input
                    className="field-input"
                    onChange={(event) => {
                      onSelectedDisposalLabelChange(event.target.value);
                    }}
                    type="text"
                    value={selectedDisposal.label ?? ""}
                  />
                </label>
                <label className="field-label">
                  素材
                  <input
                    className="field-input"
                    onChange={(event) => {
                      onSelectedMaterialNameChange(event.target.value);
                    }}
                    type="text"
                    value={selectedDisposal.material.name}
                  />
                </label>
              </>
            ) : null}
          </>
        )}
      </section>

      <section className="sidebar-section">
        <span className="sidebar-label">目標一覧</span>
        {project.line.targets.map((target) => (
          <label className="field-label" key={target.id}>
            {target.label ?? target.material.name}
            <input
              className="field-input"
              min="0.01"
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value) && value > 0) {
                  onTargetFlowChange(target.id, value / 20);
                }
              }}
              step="0.01"
              type="number"
              value={(target.requiredFlowPerTick * 20).toFixed(2)}
            />
            <span className="field-hint">
              {target.material.kind === "item" ? "item/s" : "mB/s"}
            </span>
          </label>
        ))}
      </section>

      <section className="sidebar-section">
        <span className="sidebar-label">プロセス一覧</span>
        {project.line.processes.map((process) => (
          <div className="process-card" key={process.id}>
            <strong>{process.machineName}</strong>
            <p className="sidebar-metric">
              {process.baseDurationTicks}t / {process.basePowerEUt} EU/t
            </p>
            <label className="field-label">
              動作Tier
              <select
                className="field-input"
                onChange={(event) => {
                  onTierChange(process.id, event.target.value as VoltageTier);
                }}
                value={process.operatingTier}
              >
                {TIER_ORDER.map((tier) => (
                  <option key={tier} value={tier}>
                    {tier}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ))}
      </section>

      <section className="sidebar-section">
        <span className="sidebar-label">コンパイル診断</span>
        {diagnostics.length === 0 ? (
          <p className="sidebar-metric">グラフ診断はありません。</p>
        ) : (
          <ul className="diagnostic-list">
            {diagnostics.map((entry) => (
              <li key={`${entry.code}:${entry.message}`}>{entry.message}</li>
            ))}
          </ul>
        )}
      </section>

      {calculation !== null ? (
        <section className="sidebar-section">
          <span className="sidebar-label">計算結果</span>
          <p className="sidebar-metric">
            {calculation.status} | Avg {calculation.power.averageEUt.toFixed(2)} EU/t | Max{" "}
            {calculation.power.maximumEUt.toFixed(2)} EU/t
          </p>
          <div className="result-section" data-testid="result-summary">
            <strong>プロセス</strong>
            <div className="result-card-grid">
              {calculation.processes.map((process) => (
                <div className="process-card" key={process.processId}>
                  <strong>{process.processId}</strong>
                  <p className="sidebar-metric">
                    {process.placedMachineCount} machine | {formatFlowPerSecond(process.runRatePerTick)}
                  </p>
                  <p className="sidebar-metric">
                    util {formatPercent(process.utilization)} | avg {process.averagePowerEUt.toFixed(2)} EU/t
                  </p>
                  <p className="sidebar-metric">
                    max {process.maximumPowerEUt.toFixed(2)} EU/t | {process.actualDurationTicks}t / {process.actualPowerEUt} EU/t
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="result-network-list">
            <strong>ネットワーク</strong>
            {calculation.networks.map((network) => (
              <div className="process-card" data-testid="result-network-card" key={network.networkId}>
                <strong>{network.networkId}</strong>
                <p className="sidebar-metric">
                  produced {formatFlowPerSecond(network.producedFlowPerTick)} | external{" "}
                  {formatFlowPerSecond(network.externalFlowPerTick)}
                </p>
                <p className="sidebar-metric">
                  target {formatFlowPerSecond(network.targetFlowPerTick)} | disposed{" "}
                  {formatFlowPerSecond(network.disposedFlowPerTick)}
                </p>
                <p className="sidebar-metric">
                  process use {formatFlowPerSecond(network.processConsumedFlowPerTick)} | residual{" "}
                  {formatResidual(network.balanceResidual)}
                </p>
                <ul className="sidebar-list">
                  {network.allocations.map((allocation) => (
                    <li key={`${network.networkId}:${allocation.consumerType}:${allocation.consumerId}`}>
                      {allocation.consumerType} {allocation.consumerId}:{" "}
                      {formatFlowPerSecond(allocation.flowPerTick)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="result-section">
            <strong>計算診断</strong>
            {calculation.diagnostics.length === 0 ? (
              <p className="sidebar-metric">計算診断はありません。</p>
            ) : (
              <ul className="diagnostic-list" data-testid="calculation-diagnostics">
                {calculation.diagnostics.map((entry) => (
                  <li key={`${entry.code}:${entry.message}`}>{entry.message}</li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}
    </>
  );
}

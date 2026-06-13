import { useMemo } from "react";
import { TIER_INDEX } from "../../domain/production-line/types";
import type {
  CalculationResult,
  Diagnostic,
  EditorEdge,
  ProjectDocumentV1,
  RecipeInput,
  RecipeOutput,
  VoltageTier
} from "../../domain/production-line/types";

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

const TIER_OPTIONS: VoltageTier[] = [
  "ULV",
  "LV",
  "MV",
  "HV",
  "EV",
  "IV",
  "LuV",
  "ZPM",
  "UV",
  "UHV",
  "UEV",
  "UIV",
  "UXV",
  "OpV",
  "MAX"
];

function parseNumber(value: string) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function parseOptionalNumber(value: string): number | undefined {
  if (value.trim() === "") {
    return undefined;
  }

  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
}

function calculateActualDurationTicks(baseDurationTicks: number, minimumTier: VoltageTier, operatingTier: VoltageTier) {
  const tierDelta = Math.max(TIER_INDEX[operatingTier] - TIER_INDEX[minimumTier], 0);
  return Math.max(baseDurationTicks / 2 ** tierDelta, 1);
}

function calculateActualPowerEUt(basePowerEUt: number, minimumTier: VoltageTier, operatingTier: VoltageTier) {
  const tierDelta = Math.max(TIER_INDEX[operatingTier] - TIER_INDEX[minimumTier], 0);
  return basePowerEUt * 2 ** tierDelta;
}

function unitLabel(kind: RecipeInput["material"]["kind"]) {
  return kind === "fluid" ? "mB" : "個";
}

function formatNodeKind(kind: string) {
  switch (kind) {
    case "process":
      return "プロセス";
    case "externalInput":
      return "外部入力";
    case "targetOutput":
      return "目標";
    case "disposal":
      return "廃棄先";
    default:
      return kind;
  }
}

function getNodeTitle(project: ProjectDocumentV1, nodeId: string) {
  const node = project.editor.nodes.find((candidate) => candidate.id === nodeId);
  if (node === undefined) {
    return nodeId;
  }

  if (node.kind === "process") {
    return project.line.processes.find((candidate) => candidate.id === node.entityId)?.machineName ?? nodeId;
  }

  if (node.kind === "externalInput") {
    return project.line.externalInputs.find((candidate) => candidate.id === node.entityId)?.label ?? "外部入力";
  }

  if (node.kind === "targetOutput") {
    return project.line.targets.find((candidate) => candidate.id === node.entityId)?.label ?? "目標";
  }

  return project.line.disposals.find((candidate) => candidate.id === node.entityId)?.label ?? "廃棄先";
}

function getSourceHandleOptions(project: ProjectDocumentV1, nodeId: string) {
  const node = project.editor.nodes.find((candidate) => candidate.id === nodeId);
  if (node === undefined) {
    return [];
  }

  if (node.kind === "externalInput") {
    return [{ label: "外部出力", value: "external-output" }];
  }

  if (node.kind === "process") {
    const process = project.line.processes.find((candidate) => candidate.id === node.entityId);
    return (
      process?.outputs.map((output) => ({
        label: `${output.material.name} 出力`,
        value: `process-output:${output.id}`
      })) ?? []
    );
  }

  return [];
}

function getTargetHandleOptions(project: ProjectDocumentV1, nodeId: string) {
  const node = project.editor.nodes.find((candidate) => candidate.id === nodeId);
  if (node === undefined) {
    return [];
  }

  if (node.kind === "process") {
    const process = project.line.processes.find((candidate) => candidate.id === node.entityId);
    return (
      process?.inputs.map((input) => ({
        label: `${input.material.name} 入力`,
        value: `process-input:${input.id}`
      })) ?? []
    );
  }

  if (node.kind === "targetOutput") {
    return [{ label: "目標入力", value: "target-input" }];
  }

  if (node.kind === "disposal") {
    return [{ label: "廃棄入力", value: "disposal-input" }];
  }

  return [];
}

function EdgeEditor({
  edge,
  onSelectedEdgeChange,
  project
}: {
  edge: EditorEdge;
  onSelectedEdgeChange: EditorSidebarProps["onSelectedEdgeChange"];
  project: ProjectDocumentV1;
}) {
  const sourceOptions = project.editor.nodes.filter(
    (node) => node.kind === "externalInput" || node.kind === "process"
  );
  const targetOptions = project.editor.nodes.filter(
    (node) => node.kind === "process" || node.kind === "targetOutput" || node.kind === "disposal"
  );

  const sourceHandleValue =
    edge.source.endpointType === "processOutput"
      ? `process-output:${edge.source.portId}`
      : "external-output";
  const targetHandleValue =
    edge.target.endpointType === "processInput"
      ? `process-input:${edge.target.portId}`
      : edge.target.endpointType === "targetOutput"
        ? "target-input"
        : "disposal-input";

  return (
    <section className="sidebar-section">
      <h2>選択中の接続</h2>
      <label className="field-label">
        素材
        <input className="field-input" readOnly value={edge.material.name} />
      </label>
      <label className="field-label">
        接続元ノード
        <select
          className="field-input"
          onChange={(event) => {
            const nodeId = event.target.value;
            const nextHandle = getSourceHandleOptions(project, nodeId)[0]?.value ?? null;
            onSelectedEdgeChange(edge.id, nodeId, edge.target.nodeId, nextHandle, targetHandleValue);
          }}
          value={edge.source.nodeId}
        >
          {sourceOptions.map((node) => (
            <option key={node.id} value={node.id}>
              {getNodeTitle(project, node.id)}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label">
        接続元ポート
        <select
          className="field-input"
          onChange={(event) => {
            onSelectedEdgeChange(
              edge.id,
              edge.source.nodeId,
              edge.target.nodeId,
              event.target.value,
              targetHandleValue
            );
          }}
          value={sourceHandleValue}
        >
          {getSourceHandleOptions(project, edge.source.nodeId).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label">
        接続先ノード
        <select
          className="field-input"
          onChange={(event) => {
            const nodeId = event.target.value;
            const nextHandle = getTargetHandleOptions(project, nodeId)[0]?.value ?? null;
            onSelectedEdgeChange(edge.id, edge.source.nodeId, nodeId, sourceHandleValue, nextHandle);
          }}
          value={edge.target.nodeId}
        >
          {targetOptions.map((node) => (
            <option key={node.id} value={node.id}>
              {getNodeTitle(project, node.id)}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label">
        接続先ポート
        <select
          className="field-input"
          onChange={(event) => {
            onSelectedEdgeChange(
              edge.id,
              edge.source.nodeId,
              edge.target.nodeId,
              sourceHandleValue,
              event.target.value
            );
          }}
          value={targetHandleValue}
        >
          {getTargetHandleOptions(project, edge.target.nodeId).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
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
  const selectedNode = useMemo(
    () => project.editor.nodes.find((candidate) => candidate.id === selectedNodeId) ?? null,
    [project.editor.nodes, selectedNodeId]
  );
  const selectedEdge = useMemo(
    () => project.editor.edges.find((candidate) => candidate.id === selectedEdgeId) ?? null,
    [project.editor.edges, selectedEdgeId]
  );

  const saveError = saveErrorMessage === null ? null : <p className="error-banner">{saveErrorMessage}</p>;

  if (selectedNode !== null && selectedNode.kind === "process") {
    const process = project.line.processes.find((candidate) => candidate.id === selectedNode.entityId) ?? null;
    if (process !== null) {
      const actualPowerEUt = calculateActualPowerEUt(process.basePowerEUt, process.minimumTier, process.operatingTier);
      const actualDurationTicks = calculateActualDurationTicks(
        process.baseDurationTicks,
        process.minimumTier,
        process.operatingTier
      );
      const processCalculation =
        calculation?.processes.find((candidate) => candidate.processId === process.id) ?? null;

      return (
        <>
          {saveError}
          <section className="sidebar-section">
            <h2>選択中の項目</h2>
            <p className="sidebar-metric">{formatNodeKind(selectedNode.kind)}</p>
            <label className="field-label">
              設備名
              <input
                className="field-input"
                onChange={(event) => {
                  onSelectedMachineNameChange(event.target.value);
                }}
                value={process.machineName}
              />
            </label>
            <label className="field-label">
              最低Tier
              <select
                className="field-input"
                onChange={(event) => {
                  onSelectedMinimumTierChange(event.target.value as VoltageTier);
                }}
                value={process.minimumTier}
              >
                {TIER_OPTIONS.map((tier) => (
                  <option key={tier} value={tier}>
                    {tier}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              基準消費EU/t
              <input
                className="field-input"
                min="0"
                onChange={(event) => {
                  onSelectedMetricsChange(process.baseDurationTicks, parseNumber(event.target.value));
                }}
                step="0.01"
                type="number"
                value={process.basePowerEUt}
              />
            </label>
            <label className="field-label">
              基準加工時間 (t)
              <input
                className="field-input"
                min="1"
                onChange={(event) => {
                  onSelectedMetricsChange(parseNumber(event.target.value), process.basePowerEUt);
                }}
                step="0.01"
                type="number"
                value={process.baseDurationTicks}
              />
            </label>
            <label className="field-label">
              稼働Tier
              <select
                className="field-input"
                onChange={(event) => {
                  onTierChange(process.id, event.target.value as VoltageTier);
                }}
                value={process.operatingTier}
              >
                {TIER_OPTIONS.map((tier) => (
                  <option key={tier} value={tier}>
                    {tier}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              *消費EU/t
              <input className="field-input" readOnly value={actualPowerEUt.toFixed(2)} />
            </label>
            <label className="field-label">
              *加工時間 (t)
              <input className="field-input" readOnly value={actualDurationTicks.toFixed(2)} />
            </label>
            <span className="field-hint sidebar-metric">
              * は最低Tierと稼働Tierから計算される値です。
            </span>
            <label className="field-label">
              回路番号
              <input
                className="field-input"
                onChange={(event) => {
                  onSelectedCircuitNumberChange(parseOptionalNumber(event.target.value));
                }}
                placeholder="Optional"
                type="number"
                value={process.circuitNumber ?? ""}
              />
            </label>
            {processCalculation === null ? null : (
              <p className="sidebar-metric">必要台数: {processCalculation.placedMachineCount}台</p>
            )}
          </section>
          <section className="sidebar-section recipe-section">
            <div className="recipe-section__header">
              <h2>入力</h2>
              <button
                className="secondary-button compact-button"
                onClick={() => {
                  onAddProcessInput(process.id);
                }}
                type="button"
              >
                入力追加
              </button>
            </div>
            {process.inputs.map((input) => (
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
                    <option value="item">個体</option>
                    <option value="fluid">流体</option>
                  </select>
                </label>
                <label className="field-label">
                  1レシピ量 ({unitLabel(input.material.kind)})
                  <input
                    className="field-input"
                    min="0"
                    onChange={(event) => {
                      onSelectedProcessInputChange(input.id, {
                        ...input,
                        amountPerRun: parseNumber(event.target.value)
                      });
                    }}
                    step="0.01"
                    type="number"
                    value={input.amountPerRun}
                  />
                </label>
                <div className="button-row">
                  <button
                    className="secondary-button compact-button"
                    disabled={process.inputs.length <= 1}
                    onClick={() => {
                      onRemoveProcessInput(process.id, input.id);
                    }}
                    type="button"
                  >
                    入力削除
                  </button>
                </div>
              </div>
            ))}
          </section>
          <section className="sidebar-section recipe-section">
            <div className="recipe-section__header">
              <h2>出力</h2>
              <button
                className="secondary-button compact-button"
                onClick={() => {
                  onAddProcessOutput(process.id);
                }}
                type="button"
              >
                出力追加
              </button>
            </div>
            {process.outputs.map((output) => (
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
                    <option value="item">個体</option>
                    <option value="fluid">流体</option>
                  </select>
                </label>
                <label className="field-label">
                  1レシピ量 ({unitLabel(output.material.kind)})
                  <input
                    className="field-input"
                    min="0"
                    onChange={(event) => {
                      onSelectedProcessOutputChange(output.id, {
                        ...output,
                        amountPerRun: parseNumber(event.target.value)
                      });
                    }}
                    step="0.01"
                    type="number"
                    value={output.amountPerRun}
                  />
                </label>
                <div className="button-row">
                  <button
                    className="secondary-button compact-button"
                    disabled={process.outputs.length <= 1}
                    onClick={() => {
                      onRemoveProcessOutput(process.id, output.id);
                    }}
                    type="button"
                  >
                    出力削除
                  </button>
                </div>
              </div>
            ))}
          </section>
        </>
      );
    }
  }

  if (selectedNode !== null && selectedNode.kind === "externalInput") {
    const external = project.line.externalInputs.find((candidate) => candidate.id === selectedNode.entityId) ?? null;
    if (external !== null) {
      return (
        <>
          {saveError}
          <section className="sidebar-section">
            <h2>選択中の項目</h2>
            <p className="sidebar-metric">{formatNodeKind(selectedNode.kind)}</p>
            <label className="field-label">
              ラベル
              <input
                className="field-input"
                onChange={(event) => {
                  onSelectedLabelChange(event.target.value);
                }}
                value={external.label ?? ""}
              />
            </label>
            <label className="field-label">
              素材名
              <input
                className="field-input"
                onChange={(event) => {
                  onSelectedMaterialNameChange(event.target.value);
                }}
                value={external.material.name}
              />
            </label>
            <label className="field-label">
              種別
              <input
                className="field-input"
                readOnly
                value={external.material.kind === "fluid" ? "流体" : "個体"}
              />
            </label>
            <label className="field-label">
              最大流量 (毎tick)
              <input
                className="field-input"
                onChange={(event) => {
                  onSelectedExternalLimitsChange(parseOptionalNumber(event.target.value), external.costPerUnit);
                }}
                step="0.01"
                type="number"
                value={external.maximumFlowPerTick ?? ""}
              />
            </label>
            <label className="field-label">
              コスト / 単位
              <input
                className="field-input"
                onChange={(event) => {
                  onSelectedExternalLimitsChange(
                    external.maximumFlowPerTick,
                    parseOptionalNumber(event.target.value)
                  );
                }}
                step="0.01"
                type="number"
                value={external.costPerUnit ?? ""}
              />
            </label>
          </section>
        </>
      );
    }
  }

  if (selectedNode !== null && selectedNode.kind === "targetOutput") {
    const target = project.line.targets.find((candidate) => candidate.id === selectedNode.entityId) ?? null;
    if (target !== null) {
      return (
        <>
          {saveError}
          <section className="sidebar-section">
            <h2>選択中の項目</h2>
            <p className="sidebar-metric">{formatNodeKind(selectedNode.kind)}</p>
            <label className="field-label">
              ラベル
              <input
                className="field-input"
                onChange={(event) => {
                  onSelectedTargetDetailsChange(event.target.value, target.requiredFlowPerTick);
                }}
                value={target.label ?? ""}
              />
            </label>
            <label className="field-label">
              素材名
              <input
                className="field-input"
                onChange={(event) => {
                  onSelectedMaterialNameChange(event.target.value);
                }}
                value={target.material.name}
              />
            </label>
            <label className="field-label">
              必要流量 (毎tick)
              <input
                className="field-input"
                min="0"
                onChange={(event) => {
                  onTargetFlowChange(target.id, parseNumber(event.target.value));
                }}
                step="0.01"
                type="number"
                value={target.requiredFlowPerTick}
              />
            </label>
          </section>
        </>
      );
    }
  }

  if (selectedNode !== null && selectedNode.kind === "disposal") {
    const disposal = project.line.disposals.find((candidate) => candidate.id === selectedNode.entityId) ?? null;
    if (disposal !== null) {
      return (
        <>
          {saveError}
          <section className="sidebar-section">
            <h2>選択中の項目</h2>
            <p className="sidebar-metric">{formatNodeKind(selectedNode.kind)}</p>
            <label className="field-label">
              ラベル
              <input
                className="field-input"
                onChange={(event) => {
                  onSelectedDisposalLabelChange(event.target.value);
                }}
                value={disposal.label ?? ""}
              />
            </label>
            <label className="field-label">
              素材名
              <input
                className="field-input"
                onChange={(event) => {
                  onSelectedMaterialNameChange(event.target.value);
                }}
                value={disposal.material.name}
              />
            </label>
          </section>
        </>
      );
    }
  }

  if (selectedEdge !== null) {
    return (
      <>
        {saveError}
        <EdgeEditor edge={selectedEdge} onSelectedEdgeChange={onSelectedEdgeChange} project={project} />
      </>
    );
  }

  return (
    <>
      {saveError}
      <section className="sidebar-section">
        <h2>選択中の項目</h2>
        <p className="sidebar-metric">
          ノードまたは接続を選択すると、ここに編集項目を表示します。
        </p>
        {calculation?.diagnostics.length ? (
          <p className="sidebar-metric">計算診断: {calculation.diagnostics.length} 件</p>
        ) : diagnostics.length ? (
          <p className="sidebar-metric">設計診断: {diagnostics.length} 件</p>
        ) : null}
      </section>
    </>
  );
}

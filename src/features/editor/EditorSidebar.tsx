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

function calculateActualDurationTicks(
  baseDurationTicks: number,
  minimumTier: VoltageTier,
  operatingTier: VoltageTier
) {
  const tierDelta = Math.max(TIER_INDEX[operatingTier] - TIER_INDEX[minimumTier], 0);
  return Math.max(baseDurationTicks / 2 ** tierDelta, 1);
}

function calculateActualPowerEUt(
  basePowerEUt: number,
  minimumTier: VoltageTier,
  operatingTier: VoltageTier
) {
  const tierDelta = Math.max(TIER_INDEX[operatingTier] - TIER_INDEX[minimumTier], 0);
  return basePowerEUt * 2 ** tierDelta;
}

function unitLabel(kind: RecipeInput["material"]["kind"]) {
  return kind === "fluid" ? "mB" : "\u500b";
}

function formatNodeKind(kind: string) {
  switch (kind) {
    case "process":
      return "\u30d7\u30ed\u30bb\u30b9";
    case "externalInput":
      return "\u5916\u90e8\u5165\u529b";
    case "targetOutput":
      return "\u76ee\u6a19";
    case "disposal":
      return "\u5ec3\u68c4\u5148";
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
    return (
      project.line.processes.find((candidate) => candidate.id === node.entityId)?.machineName ??
      nodeId
    );
  }

  if (node.kind === "externalInput") {
    return (
      project.line.externalInputs.find((candidate) => candidate.id === node.entityId)?.label ??
      "\u5916\u90e8\u5165\u529b"
    );
  }

  if (node.kind === "targetOutput") {
    return (
      project.line.targets.find((candidate) => candidate.id === node.entityId)?.label ??
      "\u76ee\u6a19"
    );
  }

  return (
    project.line.disposals.find((candidate) => candidate.id === node.entityId)?.label ??
    "\u5ec3\u68c4\u5148"
  );
}

function getSourceHandleOptions(project: ProjectDocumentV1, nodeId: string) {
  const node = project.editor.nodes.find((candidate) => candidate.id === nodeId);
  if (node === undefined) {
    return [];
  }

  if (node.kind === "externalInput") {
    return [{ label: "\u5916\u90e8\u51fa\u529b", value: "external-output" }];
  }

  if (node.kind === "process") {
    const process = project.line.processes.find((candidate) => candidate.id === node.entityId);
    return (
      process?.outputs.map((output) => ({
        label: `${output.material.name} \u51fa\u529b`,
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
        label: `${input.material.name} \u5165\u529b`,
        value: `process-input:${input.id}`
      })) ?? []
    );
  }

  if (node.kind === "targetOutput") {
    return [{ label: "\u76ee\u6a19\u5165\u529b", value: "target-input" }];
  }

  if (node.kind === "disposal") {
    return [{ label: "\u5ec3\u68c4\u5165\u529b", value: "disposal-input" }];
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
      <h2>{"\u9078\u629e\u4e2d\u306e\u63a5\u7d9a"}</h2>
      <label className="field-label">
        {"\u7d20\u6750"}
        <input className="field-input" readOnly value={edge.material.name} />
      </label>
      <label className="field-label">
        {"\u63a5\u7d9a\u5143\u30ce\u30fc\u30c9"}
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
        {"\u63a5\u7d9a\u5143\u30dd\u30fc\u30c8"}
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
        {"\u63a5\u7d9a\u5148\u30ce\u30fc\u30c9"}
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
        {"\u63a5\u7d9a\u5148\u30dd\u30fc\u30c8"}
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

  const saveError =
    saveErrorMessage === null ? null : <p className="error-banner">{saveErrorMessage}</p>;

  if (selectedNode !== null && selectedNode.kind === "process") {
    const process =
      project.line.processes.find((candidate) => candidate.id === selectedNode.entityId) ?? null;
    if (process !== null) {
      const actualPowerEUt = calculateActualPowerEUt(
        process.basePowerEUt,
        process.minimumTier,
        process.operatingTier
      );
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
            <h2>{"\u9078\u629e\u4e2d\u306e\u9805\u76ee"}</h2>
            <p className="sidebar-metric">{formatNodeKind(selectedNode.kind)}</p>
            <label className="field-label">
              {"\u8a2d\u5099\u540d"}
              <input
                className="field-input"
                onChange={(event) => {
                  onSelectedMachineNameChange(event.target.value);
                }}
                value={process.machineName}
              />
            </label>
            <label className="field-label">
              {"\u6700\u4f4eTier"}
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
              {"\u57fa\u6e96\u6d88\u8cbbEU/t"}
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
              {"\u57fa\u6e96\u52a0\u5de5\u6642\u9593 (t)"}
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
              {"\u7a3c\u50cdTier"}
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
              {"*\u6d88\u8cbbEU/t"}
              <input className="field-input" readOnly value={actualPowerEUt.toFixed(2)} />
            </label>
            <label className="field-label">
              {"*\u52a0\u5de5\u6642\u9593 (t)"}
              <input className="field-input" readOnly value={actualDurationTicks.toFixed(2)} />
            </label>
            <span className="field-hint sidebar-metric">
              {"* \u306f\u6700\u4f4eTier\u3068\u7a3c\u50cdTier\u304b\u3089\u8a08\u7b97\u3055\u308c\u308b\u5024\u3067\u3059\u3002"}
            </span>
            <label className="field-label">
              {"\u56de\u8def\u756a\u53f7"}
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
              <p className="sidebar-metric">
                {`\u5fc5\u8981\u53f0\u6570: ${processCalculation.placedMachineCount}\u53f0`}
              </p>
            )}
          </section>
          <section className="sidebar-section recipe-section">
            <div className="recipe-section__header">
              <h2>{"\u5165\u529b"}</h2>
              <button
                className="secondary-button compact-button"
                onClick={() => {
                  onAddProcessInput(process.id);
                }}
                type="button"
              >
                {"\u5165\u529b\u8ffd\u52a0"}
              </button>
            </div>
            {process.inputs.map((input) => (
              <div className="recipe-row" key={input.id}>
                <label className="field-label">
                  {"\u7d20\u6750"}
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
                  {"\u7a2e\u5225"}
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
                    <option value="item">{"\u500b\u4f53"}</option>
                    <option value="fluid">{"\u6d41\u4f53"}</option>
                  </select>
                </label>
                <label className="field-label">
                  {`1\u30ec\u30b7\u30d4\u91cf (${unitLabel(input.material.kind)})`}
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
                    {"\u5165\u529b\u524a\u9664"}
                  </button>
                </div>
              </div>
            ))}
          </section>
          <section className="sidebar-section recipe-section">
            <div className="recipe-section__header">
              <h2>{"\u51fa\u529b"}</h2>
              <button
                className="secondary-button compact-button"
                onClick={() => {
                  onAddProcessOutput(process.id);
                }}
                type="button"
              >
                {"\u51fa\u529b\u8ffd\u52a0"}
              </button>
            </div>
            {process.outputs.map((output) => (
              <div className="recipe-row" key={output.id}>
                <label className="field-label">
                  {"\u7d20\u6750"}
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
                  {"\u7a2e\u5225"}
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
                    <option value="item">{"\u500b\u4f53"}</option>
                    <option value="fluid">{"\u6d41\u4f53"}</option>
                  </select>
                </label>
                <label className="field-label">
                  {`1\u30ec\u30b7\u30d4\u91cf (${unitLabel(output.material.kind)})`}
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
                    {"\u51fa\u529b\u524a\u9664"}
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
    const external =
      project.line.externalInputs.find((candidate) => candidate.id === selectedNode.entityId) ?? null;
    if (external !== null) {
      return (
        <>
          {saveError}
          <section className="sidebar-section">
            <h2>{"\u9078\u629e\u4e2d\u306e\u9805\u76ee"}</h2>
            <p className="sidebar-metric">{formatNodeKind(selectedNode.kind)}</p>
            <label className="field-label">
              {"\u30e9\u30d9\u30eb"}
              <input
                className="field-input"
                onChange={(event) => {
                  onSelectedLabelChange(event.target.value);
                }}
                value={external.label ?? ""}
              />
            </label>
            <label className="field-label">
              {"\u7d20\u6750\u540d"}
              <input
                className="field-input"
                onChange={(event) => {
                  onSelectedMaterialNameChange(event.target.value);
                }}
                value={external.material.name}
              />
            </label>
            <label className="field-label">
              {"\u7a2e\u5225"}
              <input
                className="field-input"
                readOnly
                value={external.material.kind === "fluid" ? "\u6d41\u4f53" : "\u500b\u4f53"}
              />
            </label>
            <label className="field-label">
              {"\u6700\u5927\u6d41\u91cf (\u6bcetick)"}
              <input
                className="field-input"
                onChange={(event) => {
                  onSelectedExternalLimitsChange(
                    parseOptionalNumber(event.target.value),
                    external.costPerUnit
                  );
                }}
                step="0.01"
                type="number"
                value={external.maximumFlowPerTick ?? ""}
              />
            </label>
            <label className="field-label">
              {"\u30b3\u30b9\u30c8 / \u5358\u4f4d"}
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
    const target =
      project.line.targets.find((candidate) => candidate.id === selectedNode.entityId) ?? null;
    if (target !== null) {
      return (
        <>
          {saveError}
          <section className="sidebar-section">
            <h2>{"\u9078\u629e\u4e2d\u306e\u9805\u76ee"}</h2>
            <p className="sidebar-metric">{formatNodeKind(selectedNode.kind)}</p>
            <label className="field-label">
              {"\u30e9\u30d9\u30eb"}
              <input
                className="field-input"
                onChange={(event) => {
                  onSelectedTargetDetailsChange(event.target.value, target.requiredFlowPerTick);
                }}
                value={target.label ?? ""}
              />
            </label>
            <label className="field-label">
              {"\u7d20\u6750\u540d"}
              <input
                className="field-input"
                onChange={(event) => {
                  onSelectedMaterialNameChange(event.target.value);
                }}
                value={target.material.name}
              />
            </label>
            <label className="field-label">
              {"\u5fc5\u8981\u6d41\u91cf (\u6bcetick)"}
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
    const disposal =
      project.line.disposals.find((candidate) => candidate.id === selectedNode.entityId) ?? null;
    if (disposal !== null) {
      return (
        <>
          {saveError}
          <section className="sidebar-section">
            <h2>{"\u9078\u629e\u4e2d\u306e\u9805\u76ee"}</h2>
            <p className="sidebar-metric">{formatNodeKind(selectedNode.kind)}</p>
            <label className="field-label">
              {"\u30e9\u30d9\u30eb"}
              <input
                className="field-input"
                onChange={(event) => {
                  onSelectedDisposalLabelChange(event.target.value);
                }}
                value={disposal.label ?? ""}
              />
            </label>
            <label className="field-label">
              {"\u7d20\u6750\u540d"}
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
        <h2>{"\u9078\u629e\u4e2d\u306e\u9805\u76ee"}</h2>
        <p className="sidebar-metric">
          {"\u30ce\u30fc\u30c9\u307e\u305f\u306f\u63a5\u7d9a\u3092\u9078\u629e\u3059\u308b\u3068\u3001\u3053\u3053\u306b\u7de8\u96c6\u9805\u76ee\u3092\u8868\u793a\u3057\u307e\u3059\u3002"}
        </p>
        {calculation?.diagnostics.length ? (
          <p className="sidebar-metric">
            {`\u8a08\u7b97\u8a3a\u65ad: ${calculation.diagnostics.length} \u4ef6`}
          </p>
        ) : diagnostics.length ? (
          <p className="sidebar-metric">
            {`\u8a2d\u8a08\u8a3a\u65ad: ${diagnostics.length} \u4ef6`}
          </p>
        ) : null}
      </section>
    </>
  );
}

import {
  Background,
  BaseEdge,
  EdgeLabelRenderer,
  MiniMap,
  ReactFlow,
  applyNodeChanges,
  getBezierPath,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type OnMoveEnd
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { memo, useMemo } from "react";
import { TIER_INDEX } from "../../domain/production-line/types";
import type {
  CalculationResult,
  EditorEdge,
  ProjectDocumentV1
} from "../../domain/production-line/types";
import { ProcessNodeCard, type ProcessNodeCardData } from "./ProcessNodeCard";
import { useEditorStore } from "./store/editorStore";

const nodeTypes = {
  process: ProcessNodeCard
};

function formatAmount(kind: "item" | "fluid", amount: number) {
  const unit = kind === "fluid" ? "mB" : "個";
  return `${amount.toFixed(2)} ${unit}`;
}

function formatRate(kind: "item" | "fluid", flowPerTick: number) {
  const perSecond = flowPerTick * 20;
  const unit = kind === "fluid" ? "mB/s" : "個/s";
  return `${perSecond.toFixed(2)} ${unit}`;
}

function calculateActualDurationTicks(baseDurationTicks: number, minimumTier: string, operatingTier: string) {
  const minimumIndex = TIER_INDEX[minimumTier as keyof typeof TIER_INDEX];
  const operatingIndex = TIER_INDEX[operatingTier as keyof typeof TIER_INDEX];
  const tierDelta = Math.max(operatingIndex - minimumIndex, 0);
  return Math.max(baseDurationTicks / 2 ** tierDelta, 1);
}

function calculateActualPowerEUt(basePowerEUt: number, minimumTier: string, operatingTier: string) {
  const minimumIndex = TIER_INDEX[minimumTier as keyof typeof TIER_INDEX];
  const operatingIndex = TIER_INDEX[operatingTier as keyof typeof TIER_INDEX];
  const tierDelta = Math.max(operatingIndex - minimumIndex, 0);
  return basePowerEUt * 2 ** tierDelta;
}

function findProcessCalculation(calculation: CalculationResult | null, processId: string) {
  return calculation?.processes.find((candidate) => candidate.processId === processId);
}

function buildNodeData(project: ProjectDocumentV1, calculation: CalculationResult | null) {
  return project.editor.nodes.map((node) => {
    if (node.kind === "process") {
      const process = project.line.processes.find((candidate) => candidate.id === node.entityId);
      if (process === undefined) {
        throw new Error(`Process not found: ${node.entityId}`);
      }

      const processCalculation = findProcessCalculation(calculation, process.id);

      return {
        id: node.id,
        type: "process",
        position: node.position,
        data: {
          kind: "process" as const,
          title: process.machineName,
          meta: "",
          metaLines: [
            processCalculation === undefined
              ? "必要台数 未計算"
              : `必要台数 ${processCalculation.placedMachineCount}台`,
            `最低Tier ${process.minimumTier}`,
            `稼働Tier ${process.operatingTier}`,
            `*消費EU/t ${(
              processCalculation?.actualPowerEUt ??
              calculateActualPowerEUt(
                process.basePowerEUt,
                process.minimumTier,
                process.operatingTier
              )
            ).toFixed(2)}`,
            `*加工時間 ${(
              processCalculation?.actualDurationTicks ??
              calculateActualDurationTicks(
                process.baseDurationTicks,
                process.minimumTier,
                process.operatingTier
              )
            ).toFixed(2)} t`
          ],
          recipeLines: [
            ...process.inputs.map(
              (input) =>
                `入力 ${input.material.name} (${formatAmount(input.material.kind, input.amountPerRun)})`
            ),
            ...process.outputs.map(
              (output) =>
                `出力 ${output.material.name} (${formatAmount(output.material.kind, output.amountPerRun)})`
            )
          ],
          inputPorts: process.inputs.map((input) => ({
            id: `process-input:${input.id}`,
            label:
              processCalculation === undefined
                ? ""
                : `${input.material.name} ${formatRate(
                    input.material.kind,
                    processCalculation.runRatePerTick * input.amountPerRun
                  )}`
          })),
          outputPorts: process.outputs.map((output) => ({
            id: `process-output:${output.id}`,
            label:
              processCalculation === undefined
                ? ""
                : `${output.material.name} ${formatRate(
                    output.material.kind,
                    processCalculation.runRatePerTick * output.amountPerRun
                  )}`
          }))
        } satisfies ProcessNodeCardData
      };
    }

    if (node.kind === "externalInput") {
      const external = project.line.externalInputs.find((candidate) => candidate.id === node.entityId);
      if (external === undefined) {
        throw new Error(`External input not found: ${node.entityId}`);
      }

      const totalFlowPerTick =
        calculation === null
          ? null
          : project.editor.edges
              .filter(
                (edge) =>
                  edge.source.endpointType === "externalInput" && edge.source.nodeId === node.id
              )
              .reduce((sum, edge) => {
                if (edge.target.endpointType !== "processInput") {
                  return sum;
                }

                const processNode = project.editor.nodes.find(
                  (candidate) => candidate.id === edge.target.nodeId && candidate.kind === "process"
                );
                const process = processNode
                  ? project.line.processes.find((candidate) => candidate.id === processNode.entityId)
                  : undefined;
                const processCalculation = process
                  ? findProcessCalculation(calculation, process.id)
                  : undefined;
                const portId = edge.target.portId;
                const input = process?.inputs.find((candidate) => candidate.id === portId);

                if (processCalculation === undefined || input === undefined) {
                  return sum;
                }

                return sum + processCalculation.runRatePerTick * input.amountPerRun;
              }, 0);

      return {
        id: node.id,
        type: "process",
        position: node.position,
        data: {
          kind: "externalInput" as const,
          title: external.label ?? "外部入力",
          meta: external.material.name,
          inputPorts: [],
          outputPorts: [
            {
              id: "external-output",
              label:
                totalFlowPerTick === null
                  ? ""
                  : `${external.material.name} ${formatRate(
                      external.material.kind,
                      totalFlowPerTick
                    )}`
            }
          ]
        } satisfies ProcessNodeCardData
      };
    }

    if (node.kind === "targetOutput") {
      const target = project.line.targets.find((candidate) => candidate.id === node.entityId);
      if (target === undefined) {
        throw new Error(`Target not found: ${node.entityId}`);
      }

      return {
        id: node.id,
        type: "process",
        position: node.position,
        data: {
          kind: "target" as const,
          title: target.label ?? "目標",
          meta:
            calculation === null
              ? ""
              : `必要流量 ${formatRate(target.material.kind, target.requiredFlowPerTick)}`,
          inputPorts: [
            {
              id: "target-input",
              label:
                calculation === null
                  ? ""
                  : `${target.material.name} ${formatRate(
                      target.material.kind,
                      target.requiredFlowPerTick
                    )}`
            }
          ],
          outputPorts: []
        } satisfies ProcessNodeCardData
      };
    }

    const disposal = project.line.disposals.find((candidate) => candidate.id === node.entityId);
    if (disposal === undefined) {
      throw new Error(`Disposal not found: ${node.entityId}`);
    }

    return {
      id: node.id,
      type: "process",
      position: node.position,
      data: {
        kind: "disposal" as const,
        title: disposal.label ?? "廃棄先",
        meta: disposal.material.name,
        inputPorts: [
          {
            id: "disposal-input",
            label: ""
          }
        ],
        outputPorts: []
      } satisfies ProcessNodeCardData
    };
  });
}

function getEdgeLabel(edge: EditorEdge, project: ProjectDocumentV1, calculation: CalculationResult | null) {
  if (calculation === null) {
    return edge.material.name;
  }

  if (edge.source.endpointType === "processOutput") {
    const processNode = project.editor.nodes.find(
      (candidate) => candidate.id === edge.source.nodeId && candidate.kind === "process"
    );
    const process = processNode
      ? project.line.processes.find((candidate) => candidate.id === processNode.entityId)
      : undefined;
    const processCalculation = process ? findProcessCalculation(calculation, process.id) : undefined;
    const portId = edge.source.portId;
    const output = process?.outputs.find((candidate) => candidate.id === portId);

    if (processCalculation !== undefined && output !== undefined) {
      return `${edge.material.name}\n${formatRate(
        edge.material.kind,
        processCalculation.runRatePerTick * output.amountPerRun
      )}`;
    }
  }

  if (edge.source.endpointType === "externalInput") {
    const externalNode = project.editor.nodes.find(
      (candidate) => candidate.id === edge.source.nodeId && candidate.kind === "externalInput"
    );
    const external = externalNode
      ? project.line.externalInputs.find((candidate) => candidate.id === externalNode.entityId)
      : undefined;

    if (external !== undefined && edge.target.endpointType === "processInput") {
      const processNode = project.editor.nodes.find(
        (candidate) => candidate.id === edge.target.nodeId && candidate.kind === "process"
      );
      const process = processNode
        ? project.line.processes.find((candidate) => candidate.id === processNode.entityId)
        : undefined;
      const processCalculation = process ? findProcessCalculation(calculation, process.id) : undefined;
      const portId = edge.target.portId;
      const input = process?.inputs.find((candidate) => candidate.id === portId);

      if (processCalculation !== undefined && input !== undefined) {
        return `${edge.material.name}\n${formatRate(
          edge.material.kind,
          processCalculation.runRatePerTick * input.amountPerRun
        )}`;
      }
    }
  }

  return edge.material.name;
}

const FlowEdge = memo(function FlowEdge(props: EdgeProps<Edge>) {
  const project = useEditorStore((state) => state.project);
  const calculation = useEditorStore((state) => state.calculation);
  const edge = project.editor.edges.find((candidate) => candidate.id === props.id);
  const [path] = getBezierPath(props);

  if (edge === undefined) {
    return <BaseEdge {...props} path={path} />;
  }

  const label = getEdgeLabel(edge, project, calculation);
  const [title, detail] = label.split("\n");
  const labelX = (props.sourceX + props.targetX) / 2;
  const labelY = (props.sourceY + props.targetY) / 2;

  return (
    <>
      <BaseEdge {...props} path={path} />
      {detail === undefined ? null : (
        <EdgeLabelRenderer>
          <div
            className="flow-edge__label"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            <span className="flow-edge__title">{title}</span>
            <span className="flow-edge__detail">{detail}</span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

const edgeTypes = {
  flow: FlowEdge
};

interface ProductionLineCanvasProps {
  project: ProjectDocumentV1;
}

export function ProductionLineCanvas({ project }: ProductionLineCanvasProps) {
  const calculation = useEditorStore((state) => state.calculation);
  const createEdge = useEditorStore((state) => state.createEdge);
  const moveNode = useEditorStore((state) => state.moveNode);
  const selectEdge = useEditorStore((state) => state.selectEdge);
  const selectNode = useEditorStore((state) => state.selectNode);
  const selectedNodeIds = useEditorStore((state) => state.selection.nodeIds);
  const updateViewport = useEditorStore((state) => state.updateViewport);

  const nodes = useMemo(() => {
    const built = buildNodeData(project, calculation);
    return built.map((node) => ({
      ...node,
      selected: selectedNodeIds.includes(node.id)
    }));
  }, [project, calculation, selectedNodeIds]);

  const edges = useMemo<Edge[]>(
    () =>
      project.editor.edges.map((edge) => ({
        id: edge.id,
        source: edge.source.nodeId,
        sourceHandle:
          edge.source.endpointType === "processOutput"
            ? `process-output:${edge.source.portId}`
            : "external-output",
        target: edge.target.nodeId,
        targetHandle:
          edge.target.endpointType === "processInput"
            ? `process-input:${edge.target.portId}`
            : edge.target.endpointType === "targetOutput"
              ? "target-input"
              : "disposal-input",
        animated: true,
        type: "flow"
      })),
    [project.editor.edges]
  );

  const onConnect = (connection: Connection) => {
    createEdge(
      connection.source ?? null,
      connection.target ?? null,
      connection.sourceHandle,
      connection.targetHandle
    );
  };

  const onNodesChange = (changes: NodeChange<Node<ProcessNodeCardData>>[]) => {
    const selectionChange = changes.find((change) => change.type === "select");
    if (selectionChange?.type === "select") {
      selectNode(selectionChange.selected ? selectionChange.id : null);
      return;
    }

    applyNodeChanges(changes, nodes);
  };

  const reactFlowViewportProps =
    project.editor.viewport === undefined
      ? { fitView: true as const }
      : { defaultViewport: project.editor.viewport, fitView: false as const };

  const onMoveEnd: OnMoveEnd = (_event, viewport) => {
    updateViewport(viewport);
  };

  return (
    <ReactFlow
      edges={edges}
      edgeTypes={edgeTypes}
      fitViewOptions={{ padding: 0.2 }}
      maxZoom={1.6}
      minZoom={0.2}
      nodeTypes={nodeTypes}
      nodes={nodes}
      onConnect={onConnect}
      onEdgeClick={(_event, edge) => {
        selectEdge(edge.id);
      }}
      onMoveEnd={onMoveEnd}
      onNodeClick={(_event, node) => {
        selectNode(node.id);
      }}
      onNodeDragStop={(_event, node) => {
        moveNode(node.id, node.position);
      }}
      onNodesChange={onNodesChange}
      onPaneClick={() => {
        selectNode(null);
        selectEdge(null);
      }}
      {...reactFlowViewportProps}
    >
      <MiniMap pannable zoomable />
      <Background gap={24} size={1.2} />
    </ReactFlow>
  );
}

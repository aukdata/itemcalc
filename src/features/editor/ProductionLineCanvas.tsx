import type { MouseEvent } from "react";
import {
  Background,
  type Connection,
  Controls,
  MiniMap,
  type NodeChange,
  type NodeMouseHandler,
  type OnNodeDrag,
  applyNodeChanges,
  ReactFlow,
  type Edge,
  type Node
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type {
  EditorDocument,
  EditorEndpoint,
  ProjectDocumentV1
} from "../../domain/production-line/types";
import { ProcessNodeCard, type ProcessNodeCardData } from "./ProcessNodeCard";
import { useEditorStore } from "./store/editorStore";

const nodeTypes = {
  process: ProcessNodeCard
};

function toHandleId(endpoint: EditorEndpoint): string {
  switch (endpoint.endpointType) {
    case "processInput":
      return `process-input:${endpoint.portId}`;
    case "processOutput":
      return `process-output:${endpoint.portId}`;
    case "externalInput":
      return "external-output";
    case "targetOutput":
      return "target-input";
    case "disposal":
      return "disposal-input";
  }
}

function getNodePorts(project: ProjectDocumentV1, nodeId: string) {
  const node = project.editor.nodes.find((candidate) => candidate.id === nodeId);
  if (node === undefined) {
    return { inputPorts: [], outputPorts: [] };
  }

  if (node.kind === "process") {
    const process = project.line.processes.find((candidate) => candidate.id === node.entityId);
    return {
      inputPorts:
        process?.inputs.map((input) => ({
          id: `process-input:${input.id}`,
          label: `${input.material.name} (${String(input.amountPerRun)})`
        })) ?? [],
      outputPorts:
        process?.outputs.map((output) => ({
          id: `process-output:${output.id}`,
          label: `${output.material.name} (${String(output.amountPerRun)})`
        })) ?? []
    };
  }

  if (node.kind === "externalInput") {
    const external = project.line.externalInputs.find((candidate) => candidate.id === node.entityId);
    return {
      inputPorts: [],
      outputPorts: [
        {
          id: "external-output",
          label: external?.material.name ?? "output"
        }
      ]
    };
  }

  if (node.kind === "disposal") {
    const disposal = project.line.disposals.find((candidate) => candidate.id === node.entityId);
    return {
      inputPorts: [
        {
          id: "disposal-input",
          label: disposal?.material.name ?? "input"
        }
      ],
      outputPorts: []
    };
  }

  const target = project.line.targets.find((candidate) => candidate.id === node.entityId);
  return {
    inputPorts: [
      {
        id: "target-input",
        label: target?.material.name ?? "input"
      }
    ],
    outputPorts: []
  };
}

function toReactFlowNodes(project: ProjectDocumentV1, selectedNodeIds: string[]): Node<ProcessNodeCardData>[] {
  return project.editor.nodes.map((node) => {
    const ports = getNodePorts(project, node.id);
    if (node.kind === "process") {
      const process = project.line.processes.find((candidate) => candidate.id === node.entityId);
      return {
        id: node.id,
        type: "process",
        position: node.position,
        selected: selectedNodeIds.includes(node.id),
        data: {
          kind: "process",
          title: process?.machineName ?? node.entityId,
          meta: process
            ? `${String(process.baseDurationTicks)}t / ${String(process.basePowerEUt)} EU/t`
            : "Missing process",
          ...ports
        }
      };
    }

    if (node.kind === "externalInput") {
      const external = project.line.externalInputs.find((candidate) => candidate.id === node.entityId);
      return {
        id: node.id,
        type: "process",
        position: node.position,
        selected: selectedNodeIds.includes(node.id),
        data: {
          kind: "externalInput",
          title: external?.label ?? "External Input",
          meta: external ? `${external.material.name} supply` : "Missing source",
          ...ports
        }
      };
    }

    if (node.kind === "disposal") {
      const disposal = project.line.disposals.find((candidate) => candidate.id === node.entityId);
      return {
        id: node.id,
        type: "process",
        position: node.position,
        selected: selectedNodeIds.includes(node.id),
        data: {
          kind: "disposal",
          title: disposal?.label ?? "Disposal",
          meta: disposal ? `${disposal.material.name} sink` : "Missing disposal",
          ...ports
        }
      };
    }

    const target = project.line.targets.find((candidate) => candidate.id === node.entityId);
    return {
      id: node.id,
      type: "process",
      position: node.position,
      selected: selectedNodeIds.includes(node.id),
      data: {
        kind: "target",
        title: target?.label ?? "Target",
        meta: target
          ? `${(target.requiredFlowPerTick * 20).toFixed(2)} ${
              target.material.kind === "item" ? "item/s" : "mB/s"
            }`
          : "Missing target",
        ...ports
      }
    };
  });
}

function toReactFlowEdges(editor: EditorDocument): Edge[] {
  return editor.edges.map((edge) => ({
    id: edge.id,
    source: edge.source.nodeId,
    sourceHandle: toHandleId(edge.source),
    target: edge.target.nodeId,
    targetHandle: toHandleId(edge.target),
    animated: true,
    label: edge.material.name
  }));
}

export function ProductionLineCanvas({ project }: { project: ProjectDocumentV1 }) {
  const createEdge = useEditorStore((state) => state.createEdge);
  const moveNode = useEditorStore((state) => state.moveNode);
  const selectEdge = useEditorStore((state) => state.selectEdge);
  const selectNode = useEditorStore((state) => state.selectNode);
  const updateViewport = useEditorStore((state) => state.updateViewport);
  const selectedNodeIds = useEditorStore((state) => state.selection.nodeIds);
  const nodes = toReactFlowNodes(project, selectedNodeIds);
  const edges = toReactFlowEdges(project.editor);

  const onNodeClick: NodeMouseHandler<Node<ProcessNodeCardData>> = (_, node) => {
    selectNode(node.id);
  };

  const onPaneClick = () => {
    selectNode(null);
  };

  const onNodeDragStop: OnNodeDrag<Node<ProcessNodeCardData>> = (_, node) => {
    moveNode(node.id, node.position);
  };

  const onConnect = (connection: Connection) => {
    createEdge(connection.source, connection.target, connection.sourceHandle, connection.targetHandle);
  };

  const onEdgeClick = (_: MouseEvent, edge: Edge) => {
    selectEdge(edge.id);
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

  return (
    <>
      <div className="canvas-heading">
        <h2>ライン編集</h2>
        <p>この接続図から計算用ネットワークを組み立てます。</p>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        minZoom={0.2}
        maxZoom={1.6}
        fitViewOptions={{ padding: 0.2 }}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        onNodesChange={onNodesChange}
        onPaneClick={onPaneClick}
        onConnect={onConnect}
        onEdgeClick={onEdgeClick}
        onMoveEnd={(_, viewport) => {
          updateViewport(viewport);
        }}
        {...reactFlowViewportProps}
      >
        <MiniMap pannable zoomable />
        <Controls />
        <Background gap={24} size={1.2} />
      </ReactFlow>
    </>
  );
}

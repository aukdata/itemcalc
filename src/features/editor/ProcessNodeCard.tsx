import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

interface NodePortData {
  id: string;
  label: string;
}

export interface ProcessNodeCardData extends Record<string, unknown> {
  kind: "process" | "target" | "externalInput" | "disposal";
  title: string;
  meta: string;
  metaLines?: string[];
  recipeLines?: string[];
  inputPorts: NodePortData[];
  outputPorts: NodePortData[];
}

export type ProcessFlowNode = Node<ProcessNodeCardData, "process">;

const kindLabels = {
  process: "\u30d7\u30ed\u30bb\u30b9",
  target: "\u76ee\u6a19",
  externalInput: "\u5916\u90e8\u5165\u529b",
  disposal: "\u5ec3\u68c4\u5148"
} as const;

export function ProcessNodeCard({ data }: NodeProps<ProcessFlowNode>) {
  return (
    <div className="flow-node">
      <p className="flow-node__type">{kindLabels[data.kind]}</p>
      <h3 className="flow-node__title">{data.title}</h3>
      {data.meta === "" ? null : <p className="flow-node__meta">{data.meta}</p>}
      {data.metaLines?.map((line) => (
        <p className="flow-node__meta" key={line}>
          {line}
        </p>
      ))}
      {data.recipeLines === undefined || data.recipeLines.length === 0 ? null : (
        <div className="flow-node__recipe">
          <p className="flow-node__recipe-title">{"1\u53f0\u30ec\u30b7\u30d4"}</p>
          {data.recipeLines.map((line) => (
            <p className="flow-node__recipe-line" key={line}>
              {line}
            </p>
          ))}
        </div>
      )}
      <div className="flow-node__ports">
        <div className="flow-node__port-column">
          {data.inputPorts.map((port, index) => (
            <div className="flow-node__port-row flow-node__port-row--target" key={port.id}>
              <Handle
                className="flow-node__handle"
                id={port.id}
                position={Position.Left}
                style={{ top: 56 + index * 28 }}
                type="target"
              />
              <span>{port.label}</span>
            </div>
          ))}
        </div>
        <div className="flow-node__port-column flow-node__port-column--source">
          {data.outputPorts.map((port, index) => (
            <div className="flow-node__port-row flow-node__port-row--source" key={port.id}>
              <span>{port.label}</span>
              <Handle
                className="flow-node__handle"
                id={port.id}
                position={Position.Right}
                style={{ top: 56 + index * 28 }}
                type="source"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

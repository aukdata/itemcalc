import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

interface NodePortData {
  id: string;
  label: string;
}

export interface ProcessNodeCardData extends Record<string, unknown> {
  kind: "process" | "target" | "externalInput" | "disposal";
  title: string;
  meta: string;
  inputPorts: NodePortData[];
  outputPorts: NodePortData[];
}

export type ProcessFlowNode = Node<ProcessNodeCardData, "process">;

export function ProcessNodeCard({ data }: NodeProps<ProcessFlowNode>) {
  return (
    <div className="flow-node">
      <p className="flow-node__type">{data.kind}</p>
      <h3 className="flow-node__title">{data.title}</h3>
      <p className="flow-node__meta">{data.meta}</p>
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

import type { ProjectDocumentV1 } from "../../domain/production-line/types";

const now = "2026-06-13T00:00:00.000Z";

export const sampleProject: ProjectDocumentV1 = {
  schemaVersion: 1,
  id: "project-sample",
  name: "ポリエチレン デモ",
  createdAt: now,
  updatedAt: now,
  line: {
    schemaVersion: 1,
    id: "line-sample",
    name: "ポリエチレン デモ",
    processes: [
      {
        id: "process-cracker",
        machineName: "分解装置",
        inputs: [
          {
            id: "input-naphtha",
            material: { kind: "fluid", name: "Naphtha" },
            amountPerRun: 50
          }
        ],
        outputs: [
          {
            id: "output-ethylene",
            material: { kind: "fluid", name: "Ethylene" },
            amountPerRun: 30
          }
        ],
        baseDurationTicks: 40,
        basePowerEUt: 120,
        minimumTier: "MV",
        operatingTier: "MV"
      },
      {
        id: "process-reactor",
        machineName: "化学反応機",
        inputs: [
          {
            id: "input-ethylene",
            material: { kind: "fluid", name: "Ethylene" },
            amountPerRun: 30
          },
          {
            id: "input-oxygen",
            material: { kind: "fluid", name: "Oxygen" },
            amountPerRun: 10
          }
        ],
        outputs: [
          {
            id: "output-polyethylene",
            material: { kind: "item", name: "Polyethylene" },
            amountPerRun: 4
          }
        ],
        baseDurationTicks: 20,
        basePowerEUt: 90,
        minimumTier: "MV",
        operatingTier: "HV"
      }
    ],
    externalInputs: [
      {
        id: "external-naphtha",
        label: "ナフサ外部入力",
        material: { kind: "fluid", name: "Naphtha" }
      },
      {
        id: "external-oxygen",
        label: "酸素外部入力",
        material: { kind: "fluid", name: "Oxygen" }
      }
    ],
    disposals: [],
    targets: [
      {
        id: "target-polyethylene",
        label: "ポリエチレン目標",
        material: { kind: "item", name: "Polyethylene" },
        requiredFlowPerTick: 0.1
      }
    ],
    options: {
      optimizationMode: "minimizeExternalThenPower",
      epsilon: 1e-9
    }
  },
  editor: {
    nodes: [
      {
        id: "node-external-naphtha",
        kind: "externalInput",
        entityId: "external-naphtha",
        position: { x: 80, y: 80 }
      },
      {
        id: "node-cracker",
        kind: "process",
        entityId: "process-cracker",
        position: { x: 340, y: 80 }
      },
      {
        id: "node-external-oxygen",
        kind: "externalInput",
        entityId: "external-oxygen",
        position: { x: 80, y: 300 }
      },
      {
        id: "node-reactor",
        kind: "process",
        entityId: "process-reactor",
        position: { x: 640, y: 190 }
      },
      {
        id: "node-target-polyethylene",
        kind: "targetOutput",
        entityId: "target-polyethylene",
        position: { x: 960, y: 190 }
      }
    ],
    edges: [
      {
        id: "edge-naphtha",
        source: { nodeId: "node-external-naphtha", endpointType: "externalInput" },
        target: {
          nodeId: "node-cracker",
          endpointType: "processInput",
          portId: "input-naphtha"
        },
        material: { kind: "fluid", name: "Naphtha" }
      },
      {
        id: "edge-ethylene",
        source: {
          nodeId: "node-cracker",
          endpointType: "processOutput",
          portId: "output-ethylene"
        },
        target: {
          nodeId: "node-reactor",
          endpointType: "processInput",
          portId: "input-ethylene"
        },
        material: { kind: "fluid", name: "Ethylene" }
      },
      {
        id: "edge-oxygen",
        source: { nodeId: "node-external-oxygen", endpointType: "externalInput" },
        target: {
          nodeId: "node-reactor",
          endpointType: "processInput",
          portId: "input-oxygen"
        },
        material: { kind: "fluid", name: "Oxygen" }
      },
      {
        id: "edge-polyethylene",
        source: {
          nodeId: "node-reactor",
          endpointType: "processOutput",
          portId: "output-polyethylene"
        },
        target: { nodeId: "node-target-polyethylene", endpointType: "targetOutput" },
        material: { kind: "item", name: "Polyethylene" }
      }
    ],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  }
};

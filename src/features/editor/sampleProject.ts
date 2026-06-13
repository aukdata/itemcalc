import type { ProjectDocumentV1 } from "../../domain/production-line/types";

const now = "2026-06-13T00:00:00.000Z";

export const sampleProject: ProjectDocumentV1 = {
  schemaVersion: 1,
  id: "project-sample",
  name: "\u30dd\u30ea\u30a8\u30c1\u30ec\u30f3 \u30c7\u30e2",
  createdAt: now,
  updatedAt: now,
  line: {
    schemaVersion: 1,
    id: "line-sample",
    name: "\u30dd\u30ea\u30a8\u30c1\u30ec\u30f3 \u30c7\u30e2",
    processes: [
      {
        id: "process-cracker",
        machineName: "\u5206\u89e3\u88c5\u7f6e",
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
        machineName: "\u5316\u5b66\u53cd\u5fdc\u6a5f",
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
        label: "\u30ca\u30d5\u30b5\u5916\u90e8\u5165\u529b",
        material: { kind: "fluid", name: "Naphtha" }
      },
      {
        id: "external-oxygen",
        label: "\u9178\u7d20\u5916\u90e8\u5165\u529b",
        material: { kind: "fluid", name: "Oxygen" }
      }
    ],
    disposals: [],
    targets: [
      {
        id: "target-polyethylene",
        label: "\u30dd\u30ea\u30a8\u30c1\u30ec\u30f3\u76ee\u6a19",
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

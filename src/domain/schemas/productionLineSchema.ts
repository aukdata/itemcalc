import { z } from "zod";

export const materialKindSchema = z.enum(["item", "fluid"]);

export const voltageTierSchema = z.enum([
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
]);

export const materialRefSchema = z.object({
  kind: materialKindSchema,
  name: z.string().trim().min(1)
});

export const recipeInputSchema = z.object({
  id: z.string().trim().min(1),
  material: materialRefSchema,
  amountPerRun: z.number().positive()
});

export const recipeOutputSchema = z.object({
  id: z.string().trim().min(1),
  material: materialRefSchema,
  amountPerRun: z.number().positive(),
  probability: z.number().min(0).max(1).optional()
});

export const processNodeSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1).optional(),
  machineName: z.string().trim().min(1),
  circuitNumber: z.number().int().optional(),
  inputs: z.array(recipeInputSchema),
  outputs: z.array(recipeOutputSchema),
  baseDurationTicks: z.number().positive(),
  basePowerEUt: z.number().nonnegative(),
  minimumTier: voltageTierSchema,
  operatingTier: voltageTierSchema
});

export const externalInputNodeSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1).optional(),
  material: materialRefSchema,
  maximumFlowPerTick: z.number().nonnegative().optional(),
  costPerUnit: z.number().nonnegative().optional()
});

export const disposalNodeSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1).optional(),
  material: materialRefSchema
});

export const targetOutputSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1).optional(),
  material: materialRefSchema,
  requiredFlowPerTick: z.number().positive()
});

export const compiledTargetOutputSchema = targetOutputSchema.extend({
  networkId: z.string().trim().min(1)
});

export const calculationOptionsSchema = z.object({
  optimizationMode: z.enum([
    "minimizeExternalThenPower",
    "minimizePowerThenExternal"
  ]),
  epsilon: z.number().positive()
});

export const processOutputRefSchema = z.object({
  processId: z.string().trim().min(1),
  outputId: z.string().trim().min(1)
});

export const processInputRefSchema = z.object({
  processId: z.string().trim().min(1),
  inputId: z.string().trim().min(1)
});

export const externalInputConfigSchema = z.object({
  enabled: z.boolean(),
  maximumFlowPerTick: z.number().nonnegative().optional(),
  costPerUnit: z.number().nonnegative().optional(),
  sourceNodeId: z.string().trim().min(1).optional()
});

export const disposalConfigSchema = z.object({
  enabled: z.boolean(),
  nodeId: z.string().trim().min(1).optional()
});

export const materialNetworkSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1).optional(),
  material: materialRefSchema,
  producers: z.array(processOutputRefSchema),
  consumers: z.array(processInputRefSchema),
  externalInput: externalInputConfigSchema,
  disposal: disposalConfigSchema
});

export const authoredProductionLineSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  processes: z.array(processNodeSchema),
  externalInputs: z.array(externalInputNodeSchema),
  disposals: z.array(disposalNodeSchema),
  targets: z.array(targetOutputSchema),
  options: calculationOptionsSchema
});

export const productionLineSchema = authoredProductionLineSchema.extend({
  targets: z.array(compiledTargetOutputSchema),
  networks: z.array(materialNetworkSchema)
});

export const editorNodeSchema = z.object({
  id: z.string().trim().min(1),
  kind: z.enum(["process", "externalInput", "targetOutput", "disposal"]),
  entityId: z.string().trim().min(1),
  position: z.object({
    x: z.number(),
    y: z.number()
  }),
  width: z.number().optional(),
  height: z.number().optional()
});

export const editorEndpointSchema = z.discriminatedUnion("endpointType", [
  z.object({
    nodeId: z.string().trim().min(1),
    endpointType: z.literal("processInput"),
    portId: z.string().trim().min(1)
  }),
  z.object({
    nodeId: z.string().trim().min(1),
    endpointType: z.literal("processOutput"),
    portId: z.string().trim().min(1)
  }),
  z.object({
    nodeId: z.string().trim().min(1),
    endpointType: z.literal("externalInput")
  }),
  z.object({
    nodeId: z.string().trim().min(1),
    endpointType: z.literal("targetOutput")
  }),
  z.object({
    nodeId: z.string().trim().min(1),
    endpointType: z.literal("disposal")
  })
]);

export const editorEdgeSchema = z.object({
  id: z.string().trim().min(1),
  source: editorEndpointSchema,
  target: editorEndpointSchema,
  material: materialRefSchema
});

export const editorViewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number().positive()
});

export const editorDocumentSchema = z.object({
  nodes: z.array(editorNodeSchema),
  edges: z.array(editorEdgeSchema),
  viewport: editorViewportSchema.optional()
});

export const projectDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  line: authoredProductionLineSchema,
  editor: editorDocumentSchema
});

export const diagnosticSchema = z.object({
  code: z.string().trim().min(1),
  severity: z.enum(["error", "warning"]),
  message: z.string().trim().min(1),
  entityIds: z.array(z.string().trim().min(1)),
  path: z.array(z.union([z.string(), z.number()])).optional(),
  details: z.record(z.string(), z.union([z.string(), z.number()])).optional()
});

export const processCalculationSchema = z.object({
  processId: z.string().trim().min(1),
  runRatePerTick: z.number(),
  actualDurationTicks: z.number().nonnegative(),
  actualPowerEUt: z.number().nonnegative(),
  theoreticalMachineCount: z.number().nonnegative(),
  placedMachineCount: z.number().nonnegative().int(),
  utilization: z.number().nonnegative(),
  averagePowerEUt: z.number().nonnegative(),
  maximumPowerEUt: z.number().nonnegative()
});

export const consumerAllocationSchema = z.object({
  consumerType: z.enum(["process", "target"]),
  consumerId: z.string().trim().min(1),
  flowPerTick: z.number().nonnegative()
});

export const networkCalculationSchema = z.object({
  networkId: z.string().trim().min(1),
  producedFlowPerTick: z.number().nonnegative(),
  externalFlowPerTick: z.number().nonnegative(),
  processConsumedFlowPerTick: z.number().nonnegative(),
  targetFlowPerTick: z.number().nonnegative(),
  disposedFlowPerTick: z.number().nonnegative(),
  allocations: z.array(consumerAllocationSchema),
  balanceResidual: z.number()
});

export const linePowerCalculationSchema = z.object({
  averageEUt: z.number().nonnegative(),
  maximumEUt: z.number().nonnegative()
});

export const calculationResultSchema = z.object({
  status: z.enum(["solved", "infeasible", "unbounded", "invalid"]),
  processes: z.array(processCalculationSchema),
  networks: z.array(networkCalculationSchema),
  power: linePowerCalculationSchema,
  diagnostics: z.array(diagnosticSchema)
});

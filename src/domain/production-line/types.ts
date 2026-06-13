export type Id = string;

export type MaterialKind = "item" | "fluid";

export interface MaterialRef {
  kind: MaterialKind;
  name: string;
}

export interface MaterialAmount {
  material: MaterialRef;
  amount: number;
}

export type VoltageTier =
  | "ULV"
  | "LV"
  | "MV"
  | "HV"
  | "EV"
  | "IV"
  | "LuV"
  | "ZPM"
  | "UV"
  | "UHV"
  | "UEV"
  | "UIV"
  | "UXV"
  | "OpV"
  | "MAX";

export const TIER_ORDER: VoltageTier[] = [
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

export const TIER_INDEX = Object.fromEntries(
  TIER_ORDER.map((tier, index) => [tier, index])
) as Record<VoltageTier, number>;

export interface RecipeInput {
  id: Id;
  material: MaterialRef;
  amountPerRun: number;
}

export interface RecipeOutput {
  id: Id;
  material: MaterialRef;
  amountPerRun: number;
  probability?: number;
}

export interface ProcessNode {
  id: Id;
  label?: string;
  machineName: string;
  circuitNumber?: number;
  inputs: RecipeInput[];
  outputs: RecipeOutput[];
  baseDurationTicks: number;
  basePowerEUt: number;
  minimumTier: VoltageTier;
  operatingTier: VoltageTier;
}

export interface ProcessOutputRef {
  processId: Id;
  outputId: Id;
}

export interface ProcessInputRef {
  processId: Id;
  inputId: Id;
}

export interface ExternalInputNode {
  id: Id;
  label?: string;
  material: MaterialRef;
  maximumFlowPerTick?: number;
  costPerUnit?: number;
}

export interface DisposalNode {
  id: Id;
  label?: string;
  material: MaterialRef;
}

export interface ExternalInputConfig {
  enabled: boolean;
  maximumFlowPerTick?: number;
  costPerUnit?: number;
  sourceNodeId?: Id;
}

export interface DisposalConfig {
  enabled: boolean;
  nodeId?: Id;
}

export interface MaterialNetwork {
  id: Id;
  label?: string;
  material: MaterialRef;
  producers: ProcessOutputRef[];
  consumers: ProcessInputRef[];
  externalInput: ExternalInputConfig;
  disposal: DisposalConfig;
}

export interface TargetOutput {
  id: Id;
  label?: string;
  material: MaterialRef;
  requiredFlowPerTick: number;
}

export interface CompiledTargetOutput extends TargetOutput {
  networkId: Id;
}

export type OptimizationMode =
  | "minimizeExternalThenPower"
  | "minimizePowerThenExternal";

export interface CalculationOptions {
  optimizationMode: OptimizationMode;
  epsilon: number;
}

export interface AuthoredProductionLine {
  schemaVersion: 1;
  id: Id;
  name: string;
  processes: ProcessNode[];
  externalInputs: ExternalInputNode[];
  disposals: DisposalNode[];
  targets: TargetOutput[];
  options: CalculationOptions;
}

export interface ProductionLine {
  schemaVersion: 1;
  id: Id;
  name: string;
  processes: ProcessNode[];
  externalInputs: ExternalInputNode[];
  disposals: DisposalNode[];
  targets: CompiledTargetOutput[];
  networks: MaterialNetwork[];
  options: CalculationOptions;
}

export type EditorNodeKind =
  | "process"
  | "externalInput"
  | "targetOutput"
  | "disposal";

export interface EditorNode {
  id: Id;
  kind: EditorNodeKind;
  entityId: Id;
  position: { x: number; y: number };
  width?: number;
  height?: number;
}

export type EditorEndpoint =
  | { nodeId: Id; endpointType: "processInput"; portId: Id }
  | { nodeId: Id; endpointType: "processOutput"; portId: Id }
  | { nodeId: Id; endpointType: "externalInput" }
  | { nodeId: Id; endpointType: "targetOutput" }
  | { nodeId: Id; endpointType: "disposal" };

export interface EditorEdge {
  id: Id;
  source: EditorEndpoint;
  target: EditorEndpoint;
  material: MaterialRef;
}

export interface EditorViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface EditorDocument {
  nodes: EditorNode[];
  edges: EditorEdge[];
  viewport?: EditorViewport;
}

export interface ProjectDocumentV1 {
  schemaVersion: 1;
  id: Id;
  name: string;
  createdAt: string;
  updatedAt: string;
  line: AuthoredProductionLine;
  editor: EditorDocument;
}

export type DiagnosticSeverity = "error" | "warning";

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  entityIds: Id[];
  path?: (string | number)[];
  details?: Record<string, string | number>;
}

export type CalculationStatus =
  | "solved"
  | "infeasible"
  | "unbounded"
  | "invalid";

export interface ProcessCalculation {
  processId: Id;
  runRatePerTick: number;
  actualDurationTicks: number;
  actualPowerEUt: number;
  theoreticalMachineCount: number;
  placedMachineCount: number;
  utilization: number;
  averagePowerEUt: number;
  maximumPowerEUt: number;
}

export interface ConsumerAllocation {
  consumerType: "process" | "target";
  consumerId: Id;
  flowPerTick: number;
}

export interface NetworkCalculation {
  networkId: Id;
  producedFlowPerTick: number;
  externalFlowPerTick: number;
  processConsumedFlowPerTick: number;
  targetFlowPerTick: number;
  disposedFlowPerTick: number;
  allocations: ConsumerAllocation[];
  balanceResidual: number;
}

export interface LinePowerCalculation {
  averageEUt: number;
  maximumEUt: number;
}

export interface CalculationResult {
  status: CalculationStatus;
  processes: ProcessCalculation[];
  networks: NetworkCalculation[];
  power: LinePowerCalculation;
  diagnostics: Diagnostic[];
}

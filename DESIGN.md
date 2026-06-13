# ItemCalc Detailed Design

## 1. Purpose

This document turns `SPEC.md` and `TECH_SPEC.md` into an implementable detailed
design for the application, editor, persistence layer, and calculation engine.

The engine calculates a steady-state production line. It guarantees that:

- Every process receives its required average input flow
- Every target receives its required average output flow
- Item flow is measured in `item/t`
- Fluid flow is measured in `mB/t`
- Cyclic production lines can be solved
- Buffers and tick-by-tick transfer timing are not modeled

The calculation engine is independent from the UI and persistence layer.

This document is authoritative for module responsibilities, data contracts,
calculation behavior, and error handling. `SPEC.md` remains authoritative for
product behavior, and `TECH_SPEC.md` remains authoritative for selected
technologies.

## 2. Design Principles

### 2.1 Authored Data and Calculated Data

User-authored data and calculated results must be stored separately.

Authored data contains recipe definitions, selected tiers, connections, external
input settings, and targets.

Calculated data contains process rates, machine counts, utilization, flow
allocation, disposal, and power consumption.

Calculated values such as `machineCount` must not be persisted as authoritative
input.

### 2.2 Internal Units

The engine uses the following canonical units:

- Item amount: `item`
- Fluid amount: `mB`
- Flow: amount per tick
- Duration: ticks
- Power: `EU/t`
- Process rate: recipe runs per tick

Values entered per second are divided by `20` before solving.

### 2.3 Material Identity

A material key consists of both kind and name:

```text
materialKey = kind + ":" + name
```

Therefore, item `Water` and fluid `Water` are different materials.

Names are compared exactly after trimming leading and trailing whitespace.
Case-sensitive comparison is recommended for the first version.

## 3. Core Data Structures

The examples below use TypeScript-like notation, but the model is
language-independent.

### 3.1 Common Types

```ts
type Id = string;
type MaterialKind = "item" | "fluid";

interface MaterialRef {
  kind: MaterialKind;
  name: string;
}

interface MaterialAmount {
  material: MaterialRef;
  amount: number;
}
```

All numeric inputs must be finite.
Material amounts must be greater than zero.

### 3.2 Voltage Tier

```ts
type VoltageTier =
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
```

The engine maps tiers to fixed integer indices.

```ts
const TIER_INDEX: Record<VoltageTier, number> = {
  ULV: 0,
  LV: 1,
  MV: 2,
  HV: 3,
  EV: 4,
  IV: 5,
  LuV: 6,
  ZPM: 7,
  UV: 8,
  UHV: 9,
  UEV: 10,
  UIV: 11,
  UXV: 12,
  OpV: 13,
  MAX: 14,
};
```

### 3.3 Recipe Ports

Ports provide stable connection targets. A port ID is required even when a
recipe has only one input or output.

```ts
interface RecipeInput {
  id: Id;
  material: MaterialRef;
  amountPerRun: number;
}

interface RecipeOutput {
  id: Id;
  material: MaterialRef;
  amountPerRun: number;
  probability?: number;
}
```

`probability` is a value from `0` to `1`.
If omitted, it is `1`.

The normalized expected output is:

```text
expectedAmountPerRun = amountPerRun * probability
```

Duplicate entries for the same material should be combined during
normalization unless preserving separate ports is required by the UI.

### 3.4 Process Node

```ts
interface ProcessNode {
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
```

Validation rules:

- `machineName` must not be empty
- At least one input or output must exist
- `baseDurationTicks > 0`
- `basePowerEUt >= 0`
- `operatingTier >= minimumTier`
- Port IDs must be unique within the process

### 3.5 Material Network

A material network is a steady-state flow pool for exactly one material.
It represents both merge and split behavior.

All process outputs connected to a network are merged.
All process inputs and targets connected to the network consume from the merged
flow.

```ts
interface ProcessOutputRef {
  processId: Id;
  outputId: Id;
}

interface ProcessInputRef {
  processId: Id;
  inputId: Id;
}

interface ExternalInputConfig {
  enabled: boolean;
  maximumFlowPerTick?: number;
  costPerUnit?: number;
}

interface DisposalConfig {
  enabled: boolean;
}

interface MaterialNetwork {
  id: Id;
  label?: string;
  material: MaterialRef;
  producers: ProcessOutputRef[];
  consumers: ProcessInputRef[];
  externalInput: ExternalInputConfig;
  disposal: DisposalConfig;
}
```

Each process port must belong to exactly one compatible material network.
A network may be disconnected from external input, disposal, or targets.

Additional validation rules:

- `maximumFlowPerTick`, when present, must be nonnegative
- `costPerUnit`, when present, must be nonnegative
- `epsilon` must be greater than zero

Using explicit networks instead of storing arbitrary point-to-point flow values
has two benefits:

- Merge is represented naturally as a sum of all producers
- Split is represented naturally as allocation among all consumers

The UI may display direct lines between machines, but those lines should compile
into material networks before calculation.

### 3.6 Target Output

```ts
interface TargetOutput {
  id: Id;
  label?: string;
  material: MaterialRef;
  requiredFlowPerTick: number;
}

interface CompiledTargetOutput extends TargetOutput {
  networkId: Id;
}
```

`requiredFlowPerTick` must be greater than zero.
User input in amount per second is normalized before creating the solver model.

`networkId` is assigned by the graph compiler and is not directly edited by the
user. Multiple compiled targets may consume from the same material network.

### 3.7 Production Line

```ts
type OptimizationMode =
  | "minimizeExternalThenPower"
  | "minimizePowerThenExternal";

interface CalculationOptions {
  optimizationMode: OptimizationMode;
  epsilon: number;
}

interface ProductionLine {
  schemaVersion: 1;
  id: Id;
  name: string;
  processes: ProcessNode[];
  networks: MaterialNetwork[];
  targets: CompiledTargetOutput[];
  options: CalculationOptions;
}
```

Default options:

```ts
{
  optimizationMode: "minimizeExternalThenPower",
  epsilon: 1e-9
}
```

`minimizeExternalThenPower` favors recycling and internal production.
`minimizePowerThenExternal` favors lower power use even when more external
material is available.

## 4. Normalized Calculation Model

The authored model is compiled into a normalized model before solving.

```ts
interface NormalizedProcess {
  id: Id;
  actualDurationTicks: number;
  actualPowerEUt: number;
  inputs: NormalizedPort[];
  outputs: NormalizedPort[];
}

interface NormalizedPort {
  id: Id;
  networkId: Id;
  amountPerRun: number;
}
```

For outputs, `amountPerRun` is already multiplied by probability.

Overclock calculation:

```text
tierDelta = tierIndex(operatingTier) - tierIndex(minimumTier)
actualDurationTicks = max(1, baseDurationTicks / 2^tierDelta)
actualPowerEUt = basePowerEUt * 4^tierDelta
```

Fractional durations of at least `1t` are allowed in the steady-state model.

## 5. Solver Variables

The engine uses a linear programming model rather than recursive dependency
calculation.

### 5.1 Process Rate

For every process `p`:

```text
runRate[p] >= 0
```

Unit: recipe runs per tick.

This is the primary process variable.

### 5.2 External Input

For every material network `n` with external input enabled:

```text
externalFlow[n] >= 0
```

If a maximum is configured:

```text
externalFlow[n] <= maximumFlowPerTick[n]
```

If external input is disabled:

```text
externalFlow[n] = 0
```

### 5.3 Disposal

For every network `n` with disposal enabled:

```text
disposedFlow[n] >= 0
```

If disposal is disabled:

```text
disposedFlow[n] = 0
```

Target flows are constants rather than variables because the requested amount
is sent to the target exactly. Surplus goes to other consumers or disposal.

## 6. Flow Constraints

For each material network, total supply must equal total demand.

Production:

```text
produced[n] =
  sum(expectedOutputAmount[p, output] * runRate[p])
```

Process consumption:

```text
consumed[n] =
  sum(inputAmount[p, input] * runRate[p])
```

Target demand:

```text
target[n] =
  sum(requiredFlowPerTick[target])
```

Balance equation:

```text
produced[n] + externalFlow[n]
= consumed[n] + target[n] + disposedFlow[n]
```

This equality guarantees that:

- Every process input receives its full required average flow
- Every target receives its full required average flow
- No material disappears without disposal
- No material appears without production or external input

If the equation cannot be satisfied for every network, the line is infeasible.

## 7. Why Multi-Output Processes Work

A process has one shared `runRate` for all of its outputs.

For a process producing `A` and `B`, both network equations contain the same
process rate:

```text
A production = amountA * runRate
B production = amountB * runRate
```

If target A requires a higher rate than target B, the solver must choose a
`runRate` large enough for A. The surplus B is routed to another consumer or
disposal.

This is equivalent to:

```text
requiredRunRate =
  max(requiredA / amountA, requiredB / amountB, ...)
```

but also works when outputs enter cycles or merge with other producers.

## 8. Split and Merge Calculation

### 8.1 Merge

All producer flow on a material network is summed before distribution.

```text
availableFlow = producedFlow + externalFlow
```

### 8.2 Split

Each process input and target connected to the network has a calculated demand.

```text
processDemand = amountPerRun * runRate
targetDemand = requiredFlowPerTick
```

Distribution uses demand-capped equal redistribution:

1. Divide remaining available flow equally among unsatisfied consumers.
2. A consumer accepts no more than its remaining demand.
3. Return excess from satisfied consumers to the remaining pool.
4. Repeat until all demands are satisfied or no flow remains.
5. Dispose of flow remaining after all demands are satisfied.

The solver balance constraint requires enough total flow for every consumer.
Therefore, a successful final solution gives every consumer its full demand.
The split algorithm produces deterministic per-branch flow results from that
successful solution.

Pseudocode:

```ts
function distributeEqually(
  available: number,
  demands: Map<Id, number>,
  epsilon: number,
): DistributionResult {
  const allocated = new Map<Id, number>();
  const remaining = new Map(demands);

  while (available > epsilon && remaining.size > 0) {
    const share = available / remaining.size;
    let distributed = 0;

    for (const [id, demand] of remaining) {
      const amount = Math.min(share, demand);
      allocated.set(id, (allocated.get(id) ?? 0) + amount);
      remaining.set(id, demand - amount);
      distributed += amount;
    }

    available -= distributed;

    for (const [id, demand] of remaining) {
      if (demand <= epsilon) {
        remaining.delete(id);
      }
    }

    if (distributed <= epsilon) {
      break;
    }
  }

  return {
    allocated,
    unmet: remaining,
    surplus: available,
  };
}
```

## 9. Circular Process Support

Cycles require no special recursive traversal.
They appear naturally because process rates occur together in the network
balance equations.

Example:

```text
Process A consumes X and produces Y
Process B consumes Y and produces X plus target Z
```

The X and Y balance equations are solved simultaneously with the Z target
constraint.

The solver must use nonnegative variables and linear optimization. A plain
matrix inverse is insufficient because:

- Disposal is an inequality-bounded variable
- External input may have capacity limits
- Multiple feasible steady states may exist
- Some graphs are infeasible or underconstrained

## 10. Optimization Strategy

Flow constraints may have more than one valid solution. The engine uses
lexicographic optimization to choose a deterministic useful solution.

### 10.1 Default Mode

`minimizeExternalThenPower` solves in this order:

1. Minimize weighted external input
2. Fix the best external-input objective within tolerance
3. Minimize total average power
4. Fix the best power objective within tolerance
5. Minimize weighted disposal

External objective:

```text
sum(externalFlow[n] * costPerUnit[n])
```

`costPerUnit` defaults to `1`.

Average power objective:

```text
sum(runRate[p] * actualDurationTicks[p] * actualPowerEUt[p])
```

Disposal objective:

```text
sum(disposedFlow[n])
```

Exact lexicographic passes are preferred over one weighted sum because external
flow, power, items, and fluids have incompatible units.

### 10.2 Alternative Mode

`minimizePowerThenExternal` swaps the first two priorities:

1. Minimize total average power
2. Minimize weighted external input
3. Minimize weighted disposal

### 10.3 Remaining Non-Uniqueness

If multiple solutions remain after all objective passes, the engine may return
one canonical solver solution and add an `ALTERNATE_OPTIMUM` warning.

The first implementation does not need to prove uniqueness if the selected
solver cannot expose this information.

## 11. Derived Process Results

After solving `runRate[p]`:

```text
theoreticalMachineCount =
  runRate * actualDurationTicks

placedMachineCount =
  ceil(theoreticalMachineCount - epsilon)
```

Subtracting epsilon prevents floating-point noise such as
`2.0000000001` from becoming three machines.

Utilization:

```text
utilization =
  theoreticalMachineCount / placedMachineCount
```

For a zero-rate process:

```text
placedMachineCount = 0
utilization = 0
```

Power:

```text
averagePowerEUt =
  theoreticalMachineCount * actualPowerEUt

maximumPowerEUt =
  placedMachineCount * actualPowerEUt
```

Line totals:

```text
lineAveragePowerEUt = sum(process averagePowerEUt)
lineMaximumPowerEUt = sum(process maximumPowerEUt)
```

## 12. Calculation Result

```ts
type CalculationStatus = "solved" | "infeasible" | "unbounded" | "invalid";

interface ProcessCalculation {
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

interface ConsumerAllocation {
  consumerType: "process" | "target";
  consumerId: Id;
  flowPerTick: number;
}

interface NetworkCalculation {
  networkId: Id;
  producedFlowPerTick: number;
  externalFlowPerTick: number;
  processConsumedFlowPerTick: number;
  targetFlowPerTick: number;
  disposedFlowPerTick: number;
  allocations: ConsumerAllocation[];
  balanceResidual: number;
}

interface LinePowerCalculation {
  averageEUt: number;
  maximumEUt: number;
}

interface CalculationResult {
  status: CalculationStatus;
  processes: ProcessCalculation[];
  networks: NetworkCalculation[];
  power: LinePowerCalculation;
  diagnostics: Diagnostic[];
}
```

## 13. Diagnostics

```ts
type DiagnosticSeverity = "error" | "warning";

interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  entityIds: Id[];
}
```

Required diagnostic codes:

- `INVALID_NUMBER`
- `INVALID_PROBABILITY`
- `INVALID_TIER`
- `DUPLICATE_ID`
- `EMPTY_MATERIAL_NAME`
- `PORT_NOT_CONNECTED`
- `PORT_CONNECTED_MULTIPLE_TIMES`
- `MATERIAL_MISMATCH`
- `TARGET_NETWORK_NOT_FOUND`
- `INFEASIBLE_FLOW`
- `EXTERNAL_CAPACITY_EXCEEDED`
- `DISPOSAL_REQUIRED_BUT_DISABLED`
- `UNBOUNDED_MODEL`
- `ALTERNATE_OPTIMUM`
- `NUMERICAL_RESIDUAL`

Where possible, infeasibility diagnostics should identify the material networks
that cannot balance.

## 14. Engine API

```ts
interface CalculationEngine {
  calculate(line: ProductionLine): Promise<CalculationResult>;
}

interface LinearSolver {
  solve(model: LinearModel): Promise<LinearSolution>;
}
```

The calculation engine owns domain validation, normalization, LP construction,
result derivation, and verification.

The `LinearSolver` is an adapter. This keeps the domain engine independent from
the selected LP library or WebAssembly backend.

Recommended module boundaries:

```text
domain/
  material
  process
  production-line

calculation/
  validate
  normalize
  build-linear-model
  optimize
  distribute
  derive-results
  verify-results

solver/
  linear-solver
  solver-adapter
```

## 15. Calculation Pipeline

The engine executes these stages:

1. Validate authored data.
2. Normalize names, units, probabilities, and port references.
3. Compute actual process duration and EU/t from voltage tiers.
4. Build one process-rate variable per process.
5. Build external-input and disposal variables per network.
6. Build one balance equality per material network.
7. Apply external-input bounds and nonnegative variable bounds.
8. Solve the lexicographic optimization passes.
9. Derive machine counts, utilization, power, and network totals.
10. Run demand-capped equal distribution for branch-level results.
11. Verify every balance and target within epsilon.
12. Return results and diagnostics.

No partial result should be presented as valid when the solver status is
`infeasible`, `unbounded`, or `invalid`.

## 16. Result Verification

The engine must verify its own solver output.

For each network:

```text
residual =
  produced
  + external
  - consumed
  - target
  - disposed
```

Requirement:

```text
abs(residual) <= epsilon
```

For each process:

```text
runRate >= -epsilon
placedMachineCount / actualDurationTicks + epsilon >= runRate
```

For every target:

```text
allocatedTargetFlow + epsilon >= requiredTargetFlow
```

Values whose absolute value is below epsilon should be normalized to zero in
the returned result.

## 17. Required Tests

### 17.1 Validation

- Reject an operating tier below minimum tier
- Reject invalid probability
- Reject material mismatch between a port and network
- Reject an unconnected process port
- Reject duplicate IDs

### 17.2 Basic Calculation

- One process and one target
- Per-second target normalization to per-tick
- Fractional theoretical machine count
- Integer machine count ceiling
- Minimum duration clamped to `1t`
- Average and maximum power

### 17.3 Output Rules

- Probabilistic output uses expected amount
- Multi-output process runs fast enough for every target
- Surplus secondary output is disposed
- Disposal-disabled surplus makes the model infeasible

### 17.4 Flow Networks

- Multiple producers merge by addition
- Equal split with identical demands
- Split redistributes excess from a low-demand branch
- Surplus after every demand is disposed
- External input fills only the calculated deficit
- External input maximum can make a line infeasible

### 17.5 Cycles

- Closed recycling loop with one external raw material
- Byproduct recovery reduces external input
- Cycle with no feasible material balance
- Arbitrary zero-purpose circulation is minimized away
- Alternate optimal circulation produces a warning when detectable

### 17.6 Numerical Behavior

- Near-integer machine counts do not over-ceil
- Tiny negative solver values normalize to zero
- Balance residual above epsilon is reported

## 18. Deferred Features

The following are intentionally outside the first engine:

- Buffers
- Tick-by-tick transfer simulation
- Startup material requirements
- Pipe, belt, bus, or hatch capacity
- Recipe auto-selection from a recipe database
- Integer programming for machine placement
- Machine-specific overclock exceptions
- Parallel recipe behavior beyond generic machine count
- Stochastic simulation of probabilistic outputs

These features can be added later without changing the core steady-state flow
model.

## 19. Application Module Design

The application uses the following concrete module boundaries:

```text
src/
  app/
    App.tsx
    layout/
    providers/

  features/
    editor/
      components/
      compiler/
      store/
    process-form/
    targets/
    results/
    project-files/

  domain/
    production-line/
    project/
    schemas/

  calculation/
    validate/
    normalize/
    build-linear-model/
    optimize/
    distribute/
    derive-results/
    verify-results/
    engine/

  solver/
    linear-solver.ts
    highs-adapter.ts

  workers/
    calculation-messages.ts
    calculation.worker.ts
    calculation-client.ts

  persistence/
    database.ts
    repositories/
    migrations/

  shared/
    formatting/
    ids/
    units/
```

Dependency rules:

- `domain` imports no browser, React, persistence, or solver implementation code.
- `calculation` imports domain types and the `LinearSolver` interface only.
- `solver` implements the solver interface and owns all HiGHS-specific mapping.
- `features` may use React, Zustand, domain schemas, worker clients, and
  persistence repositories.
- `persistence` validates records at its boundary and never imports feature
  components.
- Worker message types and schemas are shared by both worker and main thread.
- React Flow node and edge types do not cross into `domain` or `calculation`.

## 20. Project and Editor Data

### 20.1 Persisted Project

The persisted project contains authored calculation data and editor layout.
Calculated results are transient and are not persisted as authoritative data.

```ts
interface ProjectDocumentV1 {
  schemaVersion: 1;
  id: Id;
  name: string;
  createdAt: string;
  updatedAt: string;
  line: AuthoredProductionLine;
  editor: EditorDocument;
}
```

Dates use UTC ISO 8601 strings. `id`, `createdAt`, and `updatedAt` are assigned
by the application. Imported documents keep their project ID and replace the
current stored project when saved.

### 20.2 Editor Document

The domain model is the source of truth for recipe and target values. The editor
document stores only presentation information and graph endpoints.

```ts
type EditorNodeKind = "process" | "externalInput" | "targetOutput" | "disposal";

interface EditorNode {
  id: Id;
  kind: EditorNodeKind;
  entityId: Id;
  position: { x: number; y: number };
  width?: number;
  height?: number;
}

type EditorEndpoint =
  | { nodeId: Id; endpointType: "processInput"; portId: Id }
  | { nodeId: Id; endpointType: "processOutput"; portId: Id }
  | { nodeId: Id; endpointType: "externalInput" }
  | { nodeId: Id; endpointType: "targetOutput" }
  | { nodeId: Id; endpointType: "disposal" };

interface EditorEdge {
  id: Id;
  source: EditorEndpoint;
  target: EditorEndpoint;
  material: MaterialRef;
}

interface EditorViewport {
  x: number;
  y: number;
  zoom: number;
}

interface EditorDocument {
  nodes: EditorNode[];
  edges: EditorEdge[];
  viewport?: EditorViewport;
}
```

An editor node references an existing domain entity. Deleting a process or
target deletes its editor node and all incident edges in one store command.

### 20.3 External Input and Disposal Entities

External input and disposal are explicit authored entities so they can be
placed and configured in the editor before networks are compiled.

```ts
interface ExternalInputNode {
  id: Id;
  label?: string;
  material: MaterialRef;
  maximumFlowPerTick?: number;
  costPerUnit?: number;
}

interface DisposalNode {
  id: Id;
  label?: string;
  material: MaterialRef;
}
```

The persisted authored line is:

```ts
interface AuthoredProductionLine {
  schemaVersion: 1;
  id: Id;
  name: string;
  processes: ProcessNode[];
  externalInputs: ExternalInputNode[];
  disposals: DisposalNode[];
  targets: TargetOutput[];
  options: CalculationOptions;
}
```

The graph compiler converts `AuthoredProductionLine` into the `ProductionLine`
defined in section 3.7. `networks` and target `networkId` values exist only in
that compiled calculation input and are recreated before every calculation.

## 21. Graph Compilation

### 21.1 Input

The graph compiler receives:

- Processes and their input/output ports
- External input, target, and disposal entities
- Editor nodes and edges

It returns either compiled material networks or diagnostics. The compiler is a
pure function and does not mutate editor state.

```ts
interface GraphCompileResult {
  line?: ProductionLine;
  diagnostics: Diagnostic[];
}

function compileMaterialNetworks(
  line: AuthoredProductionLine,
  editor: EditorDocument,
): GraphCompileResult;
```

### 21.2 Endpoint Direction

Valid connections are:

- Process output to process input
- Process output to target
- Process output to disposal
- External input to process input
- External input to target

Edges with reversed or unsupported direction are invalid. A process input port
must have at least one supplying path. A process output port must connect to a
consumer or disposal. A port cannot participate in two separate material
networks.

### 21.3 Network Grouping

Edges are treated as an undirected graph only for grouping endpoints into
connected components. Direction is still validated separately.

For each connected component:

1. Resolve every endpoint to its `MaterialRef`.
2. Reject the component when material kind or trimmed name differs.
3. Collect process outputs as producers.
4. Collect process inputs as consumers.
5. Allow at most one external input entity.
6. Allow zero or one disposal entity.
7. Collect all target entities.
8. Create a deterministic network ID from the lexicographically sorted endpoint
   identities.

Deterministic IDs prevent result selection and diagnostics from changing when
edges are recreated in a different order. A hash implementation may be used,
but its input format must be versioned.

### 21.4 Target Binding

During editing, a target references its own entity ID and material. During
compilation, its `networkId` is assigned from the component containing the
target endpoint. An unconnected target is an error and cannot be calculated.

### 21.5 Graph Compiler Diagnostics

The compiler emits:

- `INVALID_EDGE_DIRECTION`
- `ENDPOINT_NOT_FOUND`
- `MATERIAL_MISMATCH`
- `PORT_NOT_CONNECTED`
- `PORT_CONNECTED_MULTIPLE_TIMES`
- `MULTIPLE_EXTERNAL_INPUTS`
- `MULTIPLE_DISPOSALS`
- `TARGET_NOT_CONNECTED`

Entity IDs in diagnostics include the relevant edge, node, port, and entity
where available.

## 22. Linear Model Contract

### 22.1 Solver-Neutral Types

```ts
type ConstraintSense = "equal" | "lessOrEqual" | "greaterOrEqual";
type SolverStatus = "optimal" | "infeasible" | "unbounded" | "error";

interface LinearVariable {
  id: string;
  lowerBound: number;
  upperBound?: number;
}

interface LinearTerm {
  variableId: string;
  coefficient: number;
}

interface LinearConstraint {
  id: string;
  terms: LinearTerm[];
  sense: ConstraintSense;
  rightHandSide: number;
}

interface LinearObjective {
  direction: "minimize";
  terms: LinearTerm[];
}

interface LinearModel {
  variables: LinearVariable[];
  constraints: LinearConstraint[];
  objective: LinearObjective;
}

interface LinearSolution {
  status: SolverStatus;
  objectiveValue?: number;
  variableValues: Record<string, number>;
  message?: string;
}

interface LinearSolver {
  solve(model: LinearModel): Promise<LinearSolution>;
}
```

Variable IDs use stable prefixes:

```text
process:<processId>
external:<networkId>
disposal:<networkId>
```

Constraint IDs use:

```text
balance:<networkId>
objective-lock:<passName>
```

### 22.2 Lexicographic Passes

Each optimization pass:

1. Solves the current model.
2. Stops immediately for infeasible, unbounded, or solver error status.
3. Records the optimum.
4. Adds a lock constraint before the next pass.

For a minimization result `v`, the lock is:

```text
objectiveExpression <= v + max(epsilon, abs(v) * epsilon)
```

This tolerance prevents numerical noise from making the next pass infeasible.

### 22.3 Solver Error Mapping

HiGHS-specific statuses and exceptions are converted in `HighsAdapter`.
Unknown status, malformed output, initialization failure, and WebAssembly
failure return `status: "error"`. Solver implementation details are included in
logs but user diagnostics use the stable code `SOLVER_ERROR`.

## 23. Calculation Service and Worker Protocol

### 23.1 Request and Response

```ts
interface CalculationRequestV1 {
  protocolVersion: 1;
  requestId: Id;
  line: ProductionLine;
}

interface CalculationSuccessResponseV1 {
  protocolVersion: 1;
  requestId: Id;
  type: "result";
  result: CalculationResult;
}

interface CalculationFailureResponseV1 {
  protocolVersion: 1;
  requestId: Id;
  type: "workerError";
  message: string;
}

type CalculationResponseV1 =
  | CalculationSuccessResponseV1
  | CalculationFailureResponseV1;
```

Both directions are validated with Zod. Invalid request payloads return a
calculation result with `status: "invalid"` where possible. Uncaught worker
errors use `workerError`.

### 23.2 Client Lifecycle

`CalculationClient` owns one lazy-created worker:

```ts
interface CalculationClient {
  calculate(line: ProductionLine): Promise<CalculationResult>;
  dispose(): void;
}
```

Rules:

- Each request gets a unique request ID.
- Pending promises are indexed by request ID.
- The feature store records the latest requested ID.
- Only the latest request may replace the displayed result.
- A superseded response resolves its promise but is ignored by UI state.
- Worker crash rejects all pending requests and resets the worker instance.
- The next calculation attempts to create a fresh worker.
- `dispose` terminates the worker and rejects pending requests.

### 23.3 Calculation State

```ts
type CalculationUiState =
  | { phase: "idle" }
  | { phase: "validating" }
  | { phase: "calculating"; requestId: Id }
  | { phase: "solved"; requestId: Id; result: CalculationResult }
  | { phase: "failed"; requestId?: Id; diagnostics: Diagnostic[] };
```

Editing authored data after a successful solve marks the result stale. Stale
results may remain visible with an explicit stale indicator, but are never
presented as current.

## 24. Editor State and Commands

### 24.1 Store Shape

Zustand owns current project state:

```ts
interface EditorStore {
  project: ProjectDocumentV1 | null;
  selection: { nodeIds: Id[]; edgeIds: Id[] };
  dirtyRevision: number;
  savedRevision: number;
  calculation: CalculationUiState;
  undoStack: EditorSnapshot[];
  redoStack: EditorSnapshot[];
}
```

Temporary form text, open menus, hover state, and drag previews remain in local
React state.

### 24.2 Commands

All authored mutations use named store commands:

- `createProcess`
- `updateProcess`
- `deleteProcess`
- `createExternalInput`
- `createTarget`
- `createDisposal`
- `connectEndpoints`
- `deleteEdge`
- `moveNodes`
- `updateCalculationOptions`
- `replaceProject`

Each command:

1. Validates command input.
2. Applies one atomic state change.
3. Increments `dirtyRevision`.
4. Invalidates the current calculation.
5. Pushes one undo snapshot unless it is a transient drag update.

Node dragging records one undo entry at drag end, not one entry per pointer
event.

### 24.3 Undo and Redo

Snapshots contain authored line data and editor data, but not selection,
calculation results, or persistence metadata. The default history limit is 100
entries. A new command after undo clears the redo stack.

## 25. Screen and Interaction Design

### 25.1 Application Shell

The initial release uses one main editor screen:

```text
Top bar
  Project name
  New / Open / Import / Export
  Save status
  Calculate

Left panel
  Node creation
  Project settings
  Calculation options

Center
  React Flow canvas

Right panel
  Selected entity form
  Validation diagnostics

Bottom or collapsible panel
  Calculation summary
  Process results
  Network flows
```

On narrow screens, left, right, and result panels become drawers or stacked
sections. The canvas keeps a minimum usable height of 50 viewport height.

### 25.2 Process Form

The process form edits:

- Label and machine name
- Circuit number
- Minimum and operating tier
- Base duration and display unit
- Base EU/t
- Input rows
- Output rows and probability

Rows have stable IDs assigned at creation. Changing display unit does not alter
the canonical stored value. Form submission is disabled for local parse errors,
and domain diagnostics appear next to the relevant field.

### 25.3 Target Form

The target form edits material, amount, and unit. Supported units are:

- Item: `item/t`, `item/s`
- Fluid: `mB/t`, `mB/s`

Values are converted to `requiredFlowPerTick` at commit time. The selected
display unit is editor preference data and does not affect calculation.

### 25.4 Connection Interaction

React Flow handles correspond to typed endpoints. During connection:

- Only opposite compatible endpoint directions are connectable.
- Material mismatch is rejected before creating the edge.
- A duplicate edge is rejected.
- Invalid drops leave state unchanged and show a short validation message.

Compilation remains authoritative even when the UI pre-check accepts an edge.

### 25.5 Result Presentation

The summary displays:

- Calculation status
- Whole-line average EU/t
- Whole-line maximum EU/t
- Diagnostic count

Per-process rows display:

- Run rate
- Actual duration in ticks and seconds
- Actual EU/t
- Theoretical and placed machine count
- Utilization as a percentage
- Average and maximum EU/t

Per-network rows display produced, external, consumed, target, and disposed flow
in both per-tick and per-second forms.

## 26. Units and Formatting

Conversion functions are pure and centralized:

```ts
ticksToSeconds(ticks) = ticks / 20;
secondsToTicks(seconds) = seconds * 20;
perSecondToPerTick(value) = value / 20;
perTickToPerSecond(value) = value * 20;
```

Formatting rules:

- Keep full precision internally.
- Default display uses up to six significant fractional digits.
- Values below display precision use scientific notation.
- Percentages are derived from the unrounded utilization.
- A UI copy or export operation may request more precision than visual tables.
- `-0` is always displayed as `0`.
- Item flow may be fractional because it represents a steady-state average.

## 27. Persistence Design

### 27.1 Database Schema

Dexie stores a single current project record:

```text
projects: id, name, updatedAt
```

```ts
interface ProjectRecord {
  id: Id;
  name: string;
  schemaVersion: number;
  updatedAt: string;
  data: unknown;
}
```

The repository validates `data` using the current or a known older project
schema before returning a project to features.

### 27.2 Repository API

```ts
interface ProjectRepository {
  getCurrent(): Promise<ProjectDocumentV1 | null>;
  save(project: ProjectDocumentV1): Promise<void>;
  importDocument(value: unknown): Promise<ProjectDocumentV1>;
}
```

Saving updates `updatedAt` and replaces the complete stored document in one
IndexedDB transaction.

### 27.3 Autosave

Autosave starts 750 ms after the last authored change. A new change resets the
timer. Only one save runs at a time; if changes occur during a save, another
save starts after it finishes.

The UI states are:

- `saved`
- `unsaved`
- `saving`
- `saveError`

A save error does not discard in-memory changes. The user may retry, export, or
continue editing with a persistent warning.

### 27.4 Migrations

Each schema version has:

- A Zod schema for the old shape
- A pure migration to the next version
- Unit tests with representative documents

Migration runs in memory after reading. The upgraded document is stored only
after successful validation. Unknown future versions are rejected without
modification.

## 28. JSON Import and Export

The export envelope is:

```ts
interface ProjectExportV1 {
  format: "itemcalc-project";
  formatVersion: 1;
  exportedAt: string;
  project: ProjectDocumentV1;
}
```

Export uses UTF-8 JSON and a filename derived from a sanitized project name.
Calculated results, undo history, and transient UI state are excluded.

Import sequence:

1. Parse JSON with exception handling.
2. Validate the envelope.
3. Validate or migrate the project document.
4. Recompile editor edges into material networks.
5. Reject compiler errors.
6. Preserve the imported project ID unless explicit ID regeneration is requested.
7. Save the project.
8. Replace the current in-memory project with the imported project.

Import limits the selected file to 10 MiB in the first release. This is a
defense against accidental oversized input, not a security boundary.

## 29. Validation and Diagnostic Presentation

Validation occurs at four boundaries:

1. Form parsing for immediate field feedback.
2. Domain schema validation before state commit and import.
3. Graph compilation before calculation.
4. Result verification after solving.

Diagnostics are stable data, not preformatted UI markup:

```ts
interface Diagnostic {
  code: string;
  severity: "error" | "warning";
  message: string;
  entityIds: Id[];
  path?: Array<string | number>;
  details?: Record<string, string | number>;
}
```

Additional required codes:

- `INVALID_EDGE_DIRECTION`
- `ENDPOINT_NOT_FOUND`
- `MULTIPLE_EXTERNAL_INPUTS`
- `MULTIPLE_DISPOSALS`
- `TARGET_NOT_CONNECTED`
- `SOLVER_ERROR`
- `WORKER_ERROR`
- `IMPORT_INVALID_FORMAT`
- `IMPORT_UNSUPPORTED_VERSION`
- `PERSISTENCE_ERROR`

The UI groups diagnostics by severity and entity. Selecting a diagnostic focuses
the corresponding node or form field when possible.

## 30. Failure Behavior

- Invalid authored data: do not invoke the solver.
- Graph compiler error: do not invoke the worker.
- Infeasible model: show no process result as valid; retain diagnostics.
- Unbounded model: show no process result as valid; identify the status.
- Solver or worker failure: preserve authored data and allow retry.
- IndexedDB failure: keep the project in memory and offer export.
- Import failure: do not alter the current project or database.

No failure path clears user-authored state unless the user explicitly confirms
deletion or replacement.

## 31. Calculation Sequence

```text
User selects Calculate
  -> Editor store commits pending form edits
  -> Domain schemas validate authored entities
  -> Graph compiler creates material networks
  -> Main thread validates CalculationRequest
  -> CalculationClient posts request to worker
  -> Worker validates request
  -> Engine normalizes tiers, units, and probabilities
  -> Engine builds solver-neutral linear model
  -> HighsAdapter solves lexicographic passes
  -> Engine derives machine, power, and flow results
  -> Engine distributes branch allocations
  -> Engine verifies residuals and target allocation
  -> Worker validates and posts response
  -> Client matches request ID
  -> Store accepts only the latest response
  -> Results panel renders current result
```

## 32. Test Design and Traceability

### 32.1 Unit Tests

| Requirement                    | Primary test target                        |
| ------------------------------ | ------------------------------------------ |
| Tier overclock and 1t clamp    | `calculation/normalize`                    |
| Expected probabilistic output  | `calculation/normalize`                    |
| Merge and network balance      | `calculation/build-linear-model`           |
| Demand-capped split            | `calculation/distribute`                   |
| Machine count and power        | `calculation/derive-results`               |
| Numeric epsilon behavior       | `calculation/verify-results`               |
| Edge-to-network compilation    | `features/editor/compiler`                 |
| Unit conversion and formatting | `shared/units`, `shared/formatting`        |
| Schema and migration behavior  | `domain/schemas`, `persistence/migrations` |

### 32.2 Integration Tests

Integration tests use the real HiGHS adapter for all solver statuses and
lexicographic objective ordering. Worker tests verify schema rejection,
request-ID correlation, and recovery after worker failure.

Persistence integration tests use a fake IndexedDB implementation and cover
save, load, autosave ordering, migration, and failed writes.

### 32.3 Component and Browser Tests

Component tests cover forms, typed handles, diagnostic focusing, result tables,
and stale-result indication.

Playwright scenarios:

1. Create processes, connect ports, set a target, and calculate.
2. Verify machine and power results for a known line.
3. Save, reload, and retain graph positions.
4. Export, delete, import, and recalculate a project.
5. Display an infeasible-cycle diagnostic.
6. Import a saved project JSON and verify the editor state is restored.

### 32.4 Quality Gates

All detailed-design implementations must pass:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Release candidates additionally pass `pnpm test:e2e` on the supported browser
set.

## 33. Specification Traceability

| Source requirement                                        | Detailed design         |
| --------------------------------------------------------- | ----------------------- |
| `SPEC.md` 2: material, quantity, process, line            | Sections 2, 3, 20       |
| `SPEC.md` 3: voltage tiers and overclock                  | Sections 3.2, 4         |
| `SPEC.md` 4-5: targets and throughput                     | Sections 3.6, 5, 6      |
| `SPEC.md` 6: probabilistic output                         | Sections 3.3, 4         |
| `SPEC.md` 7: multi-output process                         | Section 7               |
| `SPEC.md` 8-9: machines and power                         | Section 11              |
| `SPEC.md` 10: merge, split, external, disposal            | Sections 3.5, 8, 21     |
| `SPEC.md` 11: circular processes and solver statuses      | Sections 6, 9, 10, 22   |
| `SPEC.md` 12: numeric model                               | Sections 16, 22.2, 26   |
| `SPEC.md` 13: display requirements                        | Sections 25.5, 26       |
| `SPEC.md` 14-15: constraints and MVP                      | Sections 18-32          |
| `TECH_SPEC.md` 6: architecture                            | Section 19              |
| `TECH_SPEC.md` 7: graph editor and state                  | Sections 20, 21, 24, 25 |
| `TECH_SPEC.md` 8: Web Worker                              | Section 23              |
| `TECH_SPEC.md` 9: HiGHS adapter                           | Section 22              |
| `TECH_SPEC.md` 10: numeric policy                         | Sections 16, 22.2, 26   |
| `TECH_SPEC.md` 11: IndexedDB and files                    | Sections 27, 28         |
| `TECH_SPEC.md` 12-13: browser and styling                 | Sections 19, 25         |
| `TECH_SPEC.md` 14-15: tests and gates                     | Sections 17, 32         |
| `TECH_SPEC.md` 16-18: deployment, security, deferred work | Sections 18, 27-30      |

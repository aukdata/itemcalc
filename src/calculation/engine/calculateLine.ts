import type {
  CalculationResult,
  Diagnostic,
  MaterialNetwork,
  ProcessNode,
  ProductionLine
} from "../../domain/production-line/types";
import { productionLineSchema } from "../../domain/schemas/productionLineSchema";
import { TIER_INDEX } from "../../domain/production-line/types";
import { HighsAdapter } from "../../solver/highs-adapter";
import type {
  LinearConstraint,
  LinearModel,
  LinearObjective,
  LinearSolver,
  LinearTerm,
  LinearVariable
} from "../../solver/linear-solver";
import { distributeEqually } from "../distribute/distributeEqually";

interface NormalizedPort {
  id: string;
  networkId: string;
  amountPerRun: number;
}

interface NormalizedProcess {
  id: string;
  actualDurationTicks: number;
  actualPowerEUt: number;
  inputs: NormalizedPort[];
  outputs: NormalizedPort[];
}

function diagnostic(
  code: string,
  severity: "error" | "warning",
  message: string,
  entityIds: string[]
): Diagnostic {
  return { code, severity, message, entityIds };
}

function normalizeValue(value: number, epsilon: number): number {
  return Math.abs(value) <= epsilon ? 0 : value;
}

function lpSafeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, "_");
}

function processVar(processId: string): string {
  return `process_${lpSafeId(processId)}`;
}

function externalVar(networkId: string): string {
  return `external_${lpSafeId(networkId)}`;
}

function disposalVar(networkId: string): string {
  return `disposal_${lpSafeId(networkId)}`;
}

function normalizeProcesses(line: ProductionLine): {
  normalizedProcesses: NormalizedProcess[];
  diagnostics: Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];

  const portToNetwork = new Map<string, string>();

  for (const network of line.networks) {
    for (const producer of network.producers) {
      portToNetwork.set(`output:${producer.processId}:${producer.outputId}`, network.id);
    }

    for (const consumer of network.consumers) {
      portToNetwork.set(`input:${consumer.processId}:${consumer.inputId}`, network.id);
    }
  }

  const normalizedProcesses = line.processes.map((process) => {
    const minimumTierIndex = TIER_INDEX[process.minimumTier];
    const operatingTierIndex = TIER_INDEX[process.operatingTier];

    if (operatingTierIndex < minimumTierIndex) {
      diagnostics.push(
        diagnostic(
          "INVALID_TIER",
          "error",
          `Process '${process.id}' operates below its minimum tier.`,
          [process.id]
        )
      );
    }

    const tierDelta = operatingTierIndex - minimumTierIndex;
    const actualDurationTicks = Math.max(1, process.baseDurationTicks / 2 ** tierDelta);
    const actualPowerEUt = process.basePowerEUt * 4 ** tierDelta;

    const inputs = process.inputs.flatMap((input) => {
      const networkId = portToNetwork.get(`input:${process.id}:${input.id}`);
      if (networkId === undefined) {
        diagnostics.push(
          diagnostic(
            "PORT_NOT_CONNECTED",
            "error",
            `Input '${input.id}' on process '${process.id}' is not connected.`,
            [process.id, input.id]
          )
        );
        return [];
      }

      return [{ id: input.id, networkId, amountPerRun: input.amountPerRun }];
    });

    const outputs = process.outputs.flatMap((output) => {
      const networkId = portToNetwork.get(`output:${process.id}:${output.id}`);
      if (networkId === undefined) {
        diagnostics.push(
          diagnostic(
            "PORT_NOT_CONNECTED",
            "error",
            `Output '${output.id}' on process '${process.id}' is not connected.`,
            [process.id, output.id]
          )
        );
        return [];
      }

      return [
        {
          id: output.id,
          networkId,
          amountPerRun: output.amountPerRun * (output.probability ?? 1)
        }
      ];
    });

    return {
      id: process.id,
      actualDurationTicks,
      actualPowerEUt,
      inputs,
      outputs
    };
  });

  return { normalizedProcesses, diagnostics };
}

function buildBalanceTerms(
  network: MaterialNetwork,
  normalizedProcesses: NormalizedProcess[]
): LinearTerm[] {
  const terms: LinearTerm[] = [];

  for (const process of normalizedProcesses) {
    for (const output of process.outputs) {
      if (output.networkId === network.id) {
        terms.push({
          variableId: processVar(process.id),
          coefficient: output.amountPerRun
        });
      }
    }

    for (const input of process.inputs) {
      if (input.networkId === network.id) {
        terms.push({
          variableId: processVar(process.id),
          coefficient: -input.amountPerRun
        });
      }
    }
  }

  terms.push({
    variableId: externalVar(network.id),
    coefficient: 1
  });
  terms.push({
    variableId: disposalVar(network.id),
    coefficient: -1
  });

  return terms;
}

function buildVariables(line: ProductionLine): LinearVariable[] {
  const variables: LinearVariable[] = [];

  for (const process of line.processes) {
    variables.push({
      id: processVar(process.id),
      lowerBound: 0
    });
  }

  for (const network of line.networks) {
    variables.push({
      id: externalVar(network.id),
      lowerBound: 0,
      ...(network.externalInput.enabled
        ? network.externalInput.maximumFlowPerTick === undefined
          ? {}
          : { upperBound: network.externalInput.maximumFlowPerTick }
        : { upperBound: 0 })
    });

    variables.push({
      id: disposalVar(network.id),
      lowerBound: 0,
      ...(network.disposal.enabled ? {} : { upperBound: 0 })
    });
  }

  return variables;
}

function buildConstraints(
  line: ProductionLine,
  normalizedProcesses: NormalizedProcess[]
): LinearConstraint[] {
  return line.networks.map((network) => {
    const targetDemand = line.targets
      .filter((target) => target.networkId === network.id)
      .reduce((sum, target) => sum + target.requiredFlowPerTick, 0);

    return {
      id: `balance_${lpSafeId(network.id)}`,
      terms: buildBalanceTerms(network, normalizedProcesses),
      sense: "equal",
      rightHandSide: targetDemand
    };
  });
}

function buildObjective(
  kind: "external" | "power" | "disposal",
  line: ProductionLine,
  normalizedProcesses: NormalizedProcess[]
): LinearObjective {
  switch (kind) {
    case "external":
      return {
        direction: "minimize",
        terms: line.networks.map((network) => ({
          variableId: externalVar(network.id),
          coefficient: network.externalInput.costPerUnit ?? 1
        }))
      };
    case "power":
      return {
        direction: "minimize",
        terms: normalizedProcesses.map((process) => ({
          variableId: processVar(process.id),
          coefficient: process.actualDurationTicks * process.actualPowerEUt
        }))
      };
    case "disposal":
      return {
        direction: "minimize",
        terms: line.networks.map((network) => ({
          variableId: disposalVar(network.id),
          coefficient: 1
        }))
      };
  }
}

function objectiveLock(
  passName: string,
  objective: LinearObjective,
  optimum: number,
  epsilon: number
): LinearConstraint {
  return {
    id: `objective_lock_${lpSafeId(passName)}`,
    terms: objective.terms,
    sense: "lessOrEqual",
    rightHandSide: optimum + Math.max(epsilon, Math.abs(optimum) * epsilon)
  };
}

async function solveLexicographic(
  baseModel: Omit<LinearModel, "objective">,
  objectives: { name: string; objective: LinearObjective }[],
  epsilon: number,
  solver: LinearSolver
) {
  const lockedConstraints = [...baseModel.constraints];
  let finalSolution:
    | {
        objectiveValue?: number;
        variableValues: Record<string, number>;
        status: "optimal";
      }
    | {
        variableValues: Record<string, number>;
        status: "infeasible" | "unbounded" | "error";
        message?: string;
      } = {
    status: "error",
    variableValues: {}
  };

  for (const { name, objective } of objectives) {
    const result = await solver.solve({
      variables: baseModel.variables,
      constraints: lockedConstraints,
      objective
    });

    if (result.status !== "optimal") {
      return result;
    }

    finalSolution = result;
    lockedConstraints.push(objectiveLock(name, objective, result.objectiveValue ?? 0, epsilon));
  }

  return finalSolution;
}

function statusResult(status: CalculationResult["status"], diagnostics: Diagnostic[]): CalculationResult {
  return {
    status,
    processes: [],
    networks: [],
    power: {
      averageEUt: 0,
      maximumEUt: 0
    },
    diagnostics
  };
}

function findInput(process: ProcessNode, inputId: string) {
  return process.inputs.find((input) => input.id === inputId);
}

function findOutput(process: ProcessNode, outputId: string) {
  return process.outputs.find((output) => output.id === outputId);
}

export async function calculateLine(
  line: ProductionLine,
  solver: LinearSolver = new HighsAdapter()
): Promise<CalculationResult> {
  const parsed = productionLineSchema.safeParse(line);

  if (!parsed.success) {
    return statusResult("invalid", [
      diagnostic("INVALID_NUMBER", "error", "Calculation input is invalid.", [])
    ]);
  }

  const epsilon = line.options.epsilon;
  const { normalizedProcesses, diagnostics } = normalizeProcesses(line);

  if (diagnostics.some((entry) => entry.severity === "error")) {
    return statusResult("invalid", diagnostics);
  }

  const baseModel = {
    variables: buildVariables(line),
    constraints: buildConstraints(line, normalizedProcesses)
  };

  const objectiveOrder =
    line.options.optimizationMode === "minimizeExternalThenPower"
      ? ["external", "power", "disposal"]
      : ["power", "external", "disposal"];

  const solution = await solveLexicographic(
    baseModel,
    objectiveOrder.map((name) => ({
      name,
      objective: buildObjective(name as "external" | "power" | "disposal", line, normalizedProcesses)
    })),
    epsilon,
    solver
  );

  if (solution.status === "infeasible") {
    return statusResult("infeasible", [
      ...diagnostics,
      diagnostic("INFEASIBLE_FLOW", "error", "The line cannot satisfy every network balance.", [])
    ]);
  }

  if (solution.status === "unbounded") {
    return statusResult("unbounded", [
      ...diagnostics,
      diagnostic("UNBOUNDED_MODEL", "error", "The line admits unbounded production.", [])
    ]);
  }

  if (solution.status === "error") {
    return statusResult("invalid", [
      ...diagnostics,
      diagnostic("SOLVER_ERROR", "error", solution.message ?? "Solver error.", [])
    ]);
  }

  const processes = normalizedProcesses.map((process) => {
    const runRatePerTick = normalizeValue(solution.variableValues[processVar(process.id)] ?? 0, epsilon);
    const theoreticalMachineCount = normalizeValue(
      runRatePerTick * process.actualDurationTicks,
      epsilon
    );
    const placedMachineCount =
      theoreticalMachineCount <= epsilon ? 0 : Math.ceil(theoreticalMachineCount - epsilon);
    const utilization =
      placedMachineCount === 0 ? 0 : theoreticalMachineCount / placedMachineCount;
    const averagePowerEUt = theoreticalMachineCount * process.actualPowerEUt;
    const maximumPowerEUt = placedMachineCount * process.actualPowerEUt;

    return {
      processId: process.id,
      runRatePerTick,
      actualDurationTicks: process.actualDurationTicks,
      actualPowerEUt: process.actualPowerEUt,
      theoreticalMachineCount,
      placedMachineCount,
      utilization,
      averagePowerEUt,
      maximumPowerEUt
    };
  });

  const networks = line.networks.map((network) => {
    const producedFlowPerTick = normalizeValue(
      network.producers.reduce((sum, producer) => {
        const process = line.processes.find((candidate) => candidate.id === producer.processId);
        const normalizedProcess = normalizedProcesses.find(
          (candidate) => candidate.id === producer.processId
        );
        const output = process ? findOutput(process, producer.outputId) : undefined;
        const runRate = normalizedProcess
          ? solution.variableValues[processVar(normalizedProcess.id)] ?? 0
          : 0;
        return sum + (output ? output.amountPerRun * (output.probability ?? 1) * runRate : 0);
      }, 0),
      epsilon
    );

    const externalFlowPerTick = normalizeValue(
      solution.variableValues[externalVar(network.id)] ?? 0,
      epsilon
    );
    const disposedFlowPerTick = normalizeValue(
      solution.variableValues[disposalVar(network.id)] ?? 0,
      epsilon
    );

    const processDemands = network.consumers.map((consumer) => {
      const process = line.processes.find((candidate) => candidate.id === consumer.processId);
      const normalizedProcess = normalizedProcesses.find(
        (candidate) => candidate.id === consumer.processId
      );
      const input = process ? findInput(process, consumer.inputId) : undefined;
      const runRate = normalizedProcess
        ? solution.variableValues[processVar(normalizedProcess.id)] ?? 0
        : 0;

      return {
        id: consumer.processId,
        consumerType: "process" as const,
        demand: input ? input.amountPerRun * runRate : 0
      };
    });

    const targetDemands = line.targets
      .filter((target) => target.networkId === network.id)
      .map((target) => ({
        id: target.id,
        consumerType: "target" as const,
        demand: target.requiredFlowPerTick
      }));

    const distribution = distributeEqually(
      producedFlowPerTick + externalFlowPerTick,
      new Map(
        [...processDemands, ...targetDemands].map((consumer) => [consumer.id, consumer.demand])
      ),
      epsilon
    );

    const allocations = [...processDemands, ...targetDemands].map((consumer) => ({
      consumerType: consumer.consumerType,
      consumerId: consumer.id,
      flowPerTick: normalizeValue(distribution.allocated.get(consumer.id) ?? 0, epsilon)
    }));

    const processConsumedFlowPerTick = normalizeValue(
      processDemands.reduce((sum, demand) => sum + demand.demand, 0),
      epsilon
    );
    const targetFlowPerTick = normalizeValue(
      targetDemands.reduce((sum, demand) => sum + demand.demand, 0),
      epsilon
    );
    const balanceResidual = normalizeValue(
      producedFlowPerTick +
        externalFlowPerTick -
        processConsumedFlowPerTick -
        targetFlowPerTick -
        disposedFlowPerTick,
      epsilon
    );

    return {
      networkId: network.id,
      producedFlowPerTick,
      externalFlowPerTick,
      processConsumedFlowPerTick,
      targetFlowPerTick,
      disposedFlowPerTick,
      allocations,
      balanceResidual
    };
  });

  const power = processes.reduce(
    (totals, process) => ({
      averageEUt: totals.averageEUt + process.averagePowerEUt,
      maximumEUt: totals.maximumEUt + process.maximumPowerEUt
    }),
    { averageEUt: 0, maximumEUt: 0 }
  );

  const resultDiagnostics = [...diagnostics];

  for (const network of networks) {
    if (Math.abs(network.balanceResidual) > epsilon) {
      resultDiagnostics.push(
        diagnostic(
          "NUMERICAL_RESIDUAL",
          "warning",
          `Network '${network.networkId}' has residual ${String(network.balanceResidual)}.`,
          [network.networkId]
        )
      );
    }
  }

  return {
    status: "solved",
    processes,
    networks,
    power,
    diagnostics: resultDiagnostics
  };
}

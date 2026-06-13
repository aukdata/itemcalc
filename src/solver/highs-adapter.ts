import highsWasmUrl from "highs/runtime?url";
import type { LinearConstraint, LinearModel, LinearSolver, LinearSolution } from "./linear-solver";

interface HighsColumn {
  Primal: number;
}

interface HighsSolutionShape {
  Status: string;
  ObjectiveValue: number;
  Columns: Record<string, HighsColumn>;
}

interface HighsModule {
  solve(problem: string, options?: Record<string, boolean | number | string>): HighsSolutionShape;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return value > 0 ? "inf" : "-inf";
  }

  if (Object.is(value, -0)) {
    return "0";
  }

  return String(value);
}

function formatTerms(terms: LinearConstraint["terms"]): string {
  if (terms.length === 0) {
    return "0";
  }

  return terms
    .map((term, index) => {
      const abs = Math.abs(term.coefficient);
      const sign = term.coefficient >= 0 ? (index === 0 ? "" : " + ") : index === 0 ? "-" : " - ";
      const coefficient = abs === 1 ? "" : `${formatNumber(abs)} `;
      return `${sign}${coefficient}${term.variableId}`;
    })
    .join("");
}

function constraintToLp(constraint: LinearConstraint): string {
  const operator =
    constraint.sense === "equal"
      ? "="
      : constraint.sense === "lessOrEqual"
        ? "<="
        : ">=";

  return ` ${constraint.id}: ${formatTerms(constraint.terms)} ${operator} ${formatNumber(
    constraint.rightHandSide
  )}`;
}

function modelToLp(model: LinearModel): string {
  const bounds = model.variables.map((variable) => {
    const lower = formatNumber(variable.lowerBound);
    const upper = variable.upperBound === undefined ? "inf" : formatNumber(variable.upperBound);
    return ` ${lower} <= ${variable.id} <= ${upper}`;
  });

  return [
    "Minimize",
    ` objective: ${formatTerms(model.objective.terms)}`,
    "Subject To",
    ...model.constraints.map(constraintToLp),
    "Bounds",
    ...bounds,
    "End"
  ].join("\n");
}

let highsPromise: Promise<HighsModule> | undefined;

async function loadHighs(): Promise<HighsModule> {
  const runtime = globalThis as typeof globalThis & {
    process?: { versions?: { node?: string } };
  };
  const isNodeRuntime =
    typeof runtime.process?.versions === "object" &&
    typeof runtime.process.versions.node === "string";

  highsPromise ??= import("highs").then(({ default: highsLoader }) =>
    (isNodeRuntime
      ? highsLoader()
      : highsLoader({
          locateFile: () => highsWasmUrl
        })) as Promise<HighsModule>
  );

  return highsPromise;
}

function mapStatus(status: string): LinearSolution["status"] {
  switch (status) {
    case "Optimal":
    case "Bound on objective reached":
    case "Target for objective reached":
      return "optimal";
    case "Infeasible":
      return "infeasible";
    case "Unbounded":
    case "Primal infeasible or unbounded":
      return "unbounded";
    default:
      return "error";
  }
}

export class HighsAdapter implements LinearSolver {
  async solve(model: LinearModel): Promise<LinearSolution> {
    try {
      const highs = await loadHighs();
      const solution = highs.solve(modelToLp(model), {
        output_flag: false,
        log_to_console: false,
        presolve: "on",
        solver: "simplex"
      });

      const variableValues = Object.fromEntries(
        Object.entries(solution.Columns).map(([name, column]) => [name, column.Primal])
      );

      return {
        status: mapStatus(solution.Status),
        objectiveValue: solution.ObjectiveValue,
        variableValues,
        message: solution.Status
      };
    } catch (error) {
      return {
        status: "error",
        variableValues: {},
        message: error instanceof Error ? error.message : "Unknown solver error"
      };
    }
  }
}

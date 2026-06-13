export type ConstraintSense = "equal" | "lessOrEqual" | "greaterOrEqual";
export type SolverStatus = "optimal" | "infeasible" | "unbounded" | "error";

export interface LinearVariable {
  id: string;
  lowerBound: number;
  upperBound?: number;
}

export interface LinearTerm {
  variableId: string;
  coefficient: number;
}

export interface LinearConstraint {
  id: string;
  terms: LinearTerm[];
  sense: ConstraintSense;
  rightHandSide: number;
}

export interface LinearObjective {
  direction: "minimize";
  terms: LinearTerm[];
}

export interface LinearModel {
  variables: LinearVariable[];
  constraints: LinearConstraint[];
  objective: LinearObjective;
}

export interface LinearSolution {
  status: SolverStatus;
  objectiveValue?: number;
  variableValues: Record<string, number>;
  message?: string;
}

export interface LinearSolver {
  solve(model: LinearModel): Promise<LinearSolution>;
}

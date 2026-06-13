import type { CalculationResult, ProductionLine } from "../domain/production-line/types";
import {
  calculationResponseSchema,
  type CalculationRequest
} from "./calculation-messages";

function createCalculationWorker() {
  return new Worker(new URL("./calculation.worker.ts", import.meta.url), {
    type: "module"
  });
}

interface PendingRequest {
  reject(error: Error): void;
  resolve(result: CalculationResult): void;
}

function makeRequestId(): string {
  return `calc-${crypto.randomUUID()}`;
}

export class CalculationClient {
  private worker: Worker | null = null;
  private pending = new Map<string, PendingRequest>();

  private ensureWorker() {
    if (this.worker !== null) {
      return this.worker;
    }

    const worker = createCalculationWorker();

    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      const parsed = calculationResponseSchema.safeParse(event.data);

      if (!parsed.success) {
        return;
      }

      const pending = this.pending.get(parsed.data.requestId);
      if (pending === undefined) {
        return;
      }

      this.pending.delete(parsed.data.requestId);

      if (parsed.data.type === "workerError") {
        pending.reject(new Error(parsed.data.message));
        return;
      }

      pending.resolve(parsed.data.result as CalculationResult);
    });

    worker.addEventListener("error", (event) => {
      const error = new Error(event.message || "Calculation worker failed.");
      for (const pending of this.pending.values()) {
        pending.reject(error);
      }
      this.pending.clear();
      worker.terminate();
      this.worker = null;
    });

    this.worker = worker;
    return worker;
  }

  async calculate(line: ProductionLine): Promise<{ requestId: string; result: CalculationResult }> {
    const requestId = makeRequestId();
    const worker = this.ensureWorker();

    const request: CalculationRequest = {
      protocolVersion: 1,
      requestId,
      line
    };

    const result = await new Promise<CalculationResult>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      worker.postMessage(request);
    });

    return { requestId, result };
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;

    for (const pending of this.pending.values()) {
      pending.reject(new Error("Calculation client was disposed."));
    }

    this.pending.clear();
  }
}

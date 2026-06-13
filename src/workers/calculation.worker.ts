import { calculateLine } from "../calculation/engine/calculateLine";
import { calculationRequestSchema } from "./calculation-messages";

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  void (async () => {
  const parsed = calculationRequestSchema.safeParse(event.data);

  if (!parsed.success) {
    const requestId =
      typeof event.data === "object" &&
      event.data !== null &&
      "requestId" in event.data &&
      typeof event.data.requestId === "string"
        ? event.data.requestId
        : "unknown";

    self.postMessage({
      protocolVersion: 1,
      requestId,
      type: "workerError",
      message: "Invalid calculation request payload."
    });
    return;
  }

  try {
    const result = await calculateLine(parsed.data.line as never);

    self.postMessage({
      protocolVersion: 1,
      requestId: parsed.data.requestId,
      type: "result",
      result
    });
  } catch (error) {
    self.postMessage({
      protocolVersion: 1,
      requestId: parsed.data.requestId,
      type: "workerError",
      message: error instanceof Error ? error.message : "Unknown worker error"
    });
  }
  })();
});

export {};

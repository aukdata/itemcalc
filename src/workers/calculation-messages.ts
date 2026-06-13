import { z } from "zod";
import {
  calculationResultSchema,
  productionLineSchema
} from "../domain/schemas/productionLineSchema";

export const calculationRequestSchema = z.object({
  protocolVersion: z.literal(1),
  requestId: z.string().trim().min(1),
  line: productionLineSchema
});

export const calculationSuccessResponseSchema = z.object({
  protocolVersion: z.literal(1),
  requestId: z.string().trim().min(1),
  type: z.literal("result"),
  result: calculationResultSchema
});

export const calculationFailureResponseSchema = z.object({
  protocolVersion: z.literal(1),
  requestId: z.string().trim().min(1),
  type: z.literal("workerError"),
  message: z.string().trim().min(1)
});

export const calculationResponseSchema = z.discriminatedUnion("type", [
  calculationSuccessResponseSchema,
  calculationFailureResponseSchema
]);

export type CalculationRequest = z.infer<typeof calculationRequestSchema>;
export type CalculationResponse = z.infer<typeof calculationResponseSchema>;

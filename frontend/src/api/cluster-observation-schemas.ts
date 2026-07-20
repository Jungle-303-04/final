import { z } from "zod";

export const clusterObservationCoverageSchema = z.strictObject({
  availability: z.enum(["available", "partial", "unavailable"]),
  observed_at: z.string().nullable(),
  reason_codes: z.array(z.string().min(1)),
}).superRefine((coverage, context) => {
  const hasReasons = coverage.reason_codes.length > 0;
  if (coverage.availability === "available" && hasReasons) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "available cluster observations cannot include reasons",
      path: ["reason_codes"],
    });
  }
  if (coverage.availability !== "available" && !hasReasons) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "incomplete cluster observations require a reason",
      path: ["reason_codes"],
    });
  }
});

export const clusterDataCoverageSchema = z.strictObject({
  inventory: clusterObservationCoverageSchema,
  cpu: clusterObservationCoverageSchema,
  memory: clusterObservationCoverageSchema,
});

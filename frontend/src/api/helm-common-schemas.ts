import { z } from "zod";

const helmUpgradeScalarSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const helmUpgradeInputSchema = z.strictObject({
  name: z.string().min(1).max(253),
  value_type: z.enum(["string", "integer", "number", "boolean"]),
  required: z.boolean(),
  default: helmUpgradeScalarSchema,
  allowed_values: z.array(helmUpgradeScalarSchema),
}).superRefine((value, context) => {
  for (const candidate of [value.default, ...value.allowed_values]) {
    if (candidate !== null && !upgradeScalarMatches(value.value_type, candidate)) {
      context.addIssue({ code: "custom", message: "Helm upgrade input scalar type is inconsistent" });
    }
  }
});

export const helmUpgradeTargetSchema = z.strictObject({
  item_id: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  version: z.string().min(1).max(80),
  chart_version: z.string().min(1).max(80),
  inputs: z.array(helmUpgradeInputSchema),
});

function upgradeScalarMatches(
  valueType: "string" | "integer" | "number" | "boolean",
  value: string | number | boolean,
): boolean {
  if (valueType === "string") return typeof value === "string";
  if (valueType === "integer") return typeof value === "number" && Number.isInteger(value);
  if (valueType === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === "boolean";
}

import { z } from "zod";

const activityOverviewBucketSchema = z.strictObject({
  from_ms: z.number().int().nonnegative(),
  to_ms: z.number().int().positive(),
  deployments: z.number().int().nonnegative(),
  alerts: z.number().int().nonnegative(),
  critical: z.number().int().nonnegative(),
}).refine((bucket) => bucket.from_ms < bucket.to_ms, {
  message: "activity bucket must have a positive window",
});

/** Runtime contract for `GET /activity/overview`. */
export const activityOverviewSchema = z.strictObject({
  from_ms: z.number().int().nonnegative(),
  to_ms: z.number().int().positive(),
  bucket_ms: z.number().int().positive(),
  buckets: z.array(activityOverviewBucketSchema).min(1).max(366),
}).superRefine((value, context) => {
  if (value.from_ms >= value.to_ms) {
    context.addIssue({ code: "custom", message: "activity window must be positive" });
    return;
  }
  if (
    value.buckets[0]?.from_ms !== value.from_ms ||
    value.buckets[value.buckets.length - 1]?.to_ms !== value.to_ms
  ) {
    context.addIssue({ code: "custom", message: "activity buckets must cover the window" });
  }
  for (let index = 1; index < value.buckets.length; index += 1) {
    if (value.buckets[index - 1]?.to_ms !== value.buckets[index]?.from_ms) {
      context.addIssue({ code: "custom", message: "activity buckets must be contiguous" });
      break;
    }
  }
});

export type ActivityOverviewEndpoint = z.infer<typeof activityOverviewSchema>;

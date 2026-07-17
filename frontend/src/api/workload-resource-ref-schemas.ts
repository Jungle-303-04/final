import { z } from "zod";

export const workloadDetailResourceRefSchema = z.strictObject({
  api_group: z.string(),
  version: z.string().min(1),
  kind: z.string().min(1),
  namespace: z.string().min(1).nullable(),
  name: z.string().min(1),
  uid: z.string().min(1),
});

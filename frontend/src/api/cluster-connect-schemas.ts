import { z } from "zod";

export const clusterConnectProviderSchema = z.enum(["aws", "gcp", "azure", "onprem"]);
export const clusterConnectEnvironmentSchema = z.enum([
  "development",
  "staging",
  "production",
]);

export const clusterConnectResponseSchema = z.strictObject({
  cluster_id: z.string(),
  install_command: z.string().min(1),
  expires_at: z.string(),
});

export const clusterConnectStatusResponseSchema = z.strictObject({
  status: z.enum(["waiting", "connected", "expired"]),
  agent_version: z.string().nullable(),
  connected_at: z.string().nullable(),
});

export type ClusterConnectProvider = z.infer<typeof clusterConnectProviderSchema>;
export type ClusterConnectEnvironment = z.infer<typeof clusterConnectEnvironmentSchema>;
export type ClusterConnectResponse = z.infer<typeof clusterConnectResponseSchema>;
export type ClusterConnectStatusResponse = z.infer<typeof clusterConnectStatusResponseSchema>;

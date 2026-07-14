import { z } from "zod";

export const relationTopologyNodeSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.string().min(1),
  name: z.string().min(1),
  status: z.string(),
});

export const relationTopologyEdgeSchema = z.strictObject({
  from: z.string().min(1),
  to: z.string().min(1),
  type: z.enum(["owns", "runs_on", "selects", "routes_to"]),
});

export const relationTopologySchema = z.strictObject({
  nodes: z.array(relationTopologyNodeSchema).max(1_000),
  edges: z.array(relationTopologyEdgeSchema).max(4_000),
}).superRefine((topology, context) => {
  const nodeIds = new Set<string>();
  topology.nodes.forEach((node, index) => {
    if (nodeIds.has(node.id)) {
      context.addIssue({
        code: "custom",
        message: "relation topology node ids must be unique",
        path: ["nodes", index, "id"],
      });
    }
    nodeIds.add(node.id);
  });
  const edgeKeys = new Set<string>();
  topology.edges.forEach((edge, index) => {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      context.addIssue({
        code: "custom",
        message: "relation topology edge endpoints must reference returned nodes",
        path: ["edges", index],
      });
    }
    const key = `${edge.from}\u0000${edge.to}\u0000${edge.type}`;
    if (edgeKeys.has(key)) {
      context.addIssue({
        code: "custom",
        message: "relation topology edges must be unique",
        path: ["edges", index],
      });
    }
    edgeKeys.add(key);
  });
});

export type RelationTopologyEndpoint = z.infer<typeof relationTopologySchema>;

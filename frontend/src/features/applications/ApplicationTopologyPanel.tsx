import { useMemo } from "react";
import { useI18n } from "../../shared/i18n";
import { StatusMark } from "../../shared/ui/StatusMark";
import { Badge } from "../../shared/ui/primitives/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui/primitives/card";
import { Separator } from "../../shared/ui/primitives/separator";
import { applicationsCopy } from "../../shared/i18n/applicationSurfaceCopy";
import type { ApplicationTopology, ApplicationTopologyNode } from "./applicationsContract";
import { applicationStatusTone, formatObservedTime } from "./applicationPresentation";

const EMPTY_TOPOLOGY_NODES: ApplicationTopologyNode[] = [];

export function ApplicationTopologyPanel({ topology }: { topology: ApplicationTopology }) {
  const { locale, t } = useI18n();
  const copy = applicationsCopy(t);
  const nodes = topology.nodes ?? EMPTY_TOPOLOGY_NODES;
  const nodeById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );
  if (topology.availability === "unavailable" || topology.nodes === null || topology.edges === null) {
    return <UnavailableTopology />;
  }
  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
      <Card data-testid="application-topology-nodes">
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>{copy.topology}</CardTitle>
          {topology.completeness === "partial" ? <Badge variant="outline">{copy.partial}</Badge> : null}
        </CardHeader>
        <CardContent className="grid gap-2">
          {nodes.length === 0 ? <p className="text-sm text-muted-foreground">{copy.noTopology}</p> : nodes.map((node) => (
            <div className="flex min-w-0 items-start justify-between gap-3 rounded-lg border px-3 py-2.5" key={node.id}>
              <div className="grid min-w-0 gap-1">
                <span className="truncate text-sm font-medium" title={`${node.kind}/${node.name}`}>
                  {node.kind}/{node.name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {[node.clusterId, node.namespace, node.resourceType].filter(Boolean).join(" · ")}
                </span>
                {node.observedAt ? (
                  <span className="text-xs text-muted-foreground">{formatObservedTime(node.observedAt, locale)}</span>
                ) : null}
              </div>
              <StatusMark label={node.health} tone={applicationStatusTone(node.health)} />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card data-testid="application-topology-edges">
        <CardHeader><CardTitle>{copy.relationships}</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          {topology.edges.length === 0 ? <p className="text-sm text-muted-foreground">{copy.noRelationships}</p> : topology.edges.map((edge, index) => (
            <div className="grid gap-2" key={edge.id}>
              {index > 0 ? <Separator /> : null}
              <Badge className="w-fit" variant="outline">{edge.type}</Badge>
              <span className="min-w-0 truncate text-sm">
                {nodeLabel(nodeById.get(edge.fromId), edge.fromId)} → {nodeLabel(nodeById.get(edge.toId), edge.toId)}
              </span>
              <span className="text-xs text-muted-foreground">{edge.evidenceType}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function UnavailableTopology() {
  const { t } = useI18n();
  return <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">{applicationsCopy(t).unavailable}</p>;
}

function nodeLabel(node: ApplicationTopologyNode | undefined, fallback: string): string {
  return node ? `${node.kind}/${node.name}` : fallback;
}

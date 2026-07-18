import { useEffect, useRef, useState } from "react";

import type {
  ArtifactHubChart,
  ArtifactHubChartDetail,
  ArtifactHubSearchPage,
  HelmPort,
} from "../../features/helm/helmContract";
import { useHelmCopy } from "../../features/helm/helmCopy";
import { Alert, AlertDescription } from "../../shared/ui/primitives/alert";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../shared/ui/primitives/card";
import { Input } from "../../shared/ui/primitives/input";
import { Spinner } from "../../shared/ui/primitives/spinner";

type SearchState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "failed" }
  | { phase: "ready"; page: ArtifactHubSearchPage };

export function HelmArtifactHubPanel({ port }: { port: HelmPort }) {
  const copy = useHelmCopy();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ phase: "idle" });
  const [detail, setDetail] = useState<ArtifactHubChartDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  const search = async () => {
    const normalized = query.trim();
    if (normalized === "") return;
    const controller = replaceRequest(requestRef);
    setDetail(null);
    setState({ phase: "loading" });
    try {
      const page = await port.searchArtifactHub({ query: normalized, limit: 20 }, controller.signal);
      setState({ phase: "ready", page });
    } catch {
      if (!controller.signal.aborted) setState({ phase: "failed" });
    }
  };
  const openDetail = async (chart: ArtifactHubChart) => {
    const controller = replaceRequest(requestRef);
    setDetailLoading(true);
    try {
      setDetail(await port.getArtifactHubChart({
        repository: chart.repository.name,
        chart: chart.name,
        version: chart.version,
      }, controller.signal));
    } catch {
      if (!controller.signal.aborted) setState({ phase: "failed" });
    } finally {
      if (!controller.signal.aborted) setDetailLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle><h2>{copy.artifactHub}</h2></CardTitle>
        <CardDescription>{copy.artifactHubDescription}</CardDescription>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-3">
        <form className="flex min-w-0 gap-2" onSubmit={(event) => { event.preventDefault(); void search(); }}>
          <Input
            aria-label={copy.artifactHubSearchLabel}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.artifactHubSearchPlaceholder}
            value={query}
          />
          <Button disabled={query.trim() === "" || state.phase === "loading"} type="submit" variant="outline">
            {state.phase === "loading" ? <Spinner decorative /> : null}
            {copy.artifactHubSearch}
          </Button>
        </form>
        {state.phase === "failed" ? (
          <Alert variant="destructive"><AlertDescription>{copy.artifactHubFailed}</AlertDescription></Alert>
        ) : null}
        {state.phase === "ready" && state.page.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{copy.artifactHubEmpty}</p>
        ) : null}
        {state.phase === "ready" && state.page.items.length > 0 ? (
          <ul className="divide-y border-y">
            {state.page.items.map((chart) => (
              <li className="grid min-w-0 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto]" key={chart.packageId}>
                <div className="min-w-0">
                  <Button className="h-auto max-w-full justify-start p-0 text-left" onClick={() => void openDetail(chart)} type="button" variant="link">
                    <span className="truncate">{chart.repository.name}/{chart.name} {chart.version}</span>
                  </Button>
                  {chart.description ? <p className="line-clamp-2 text-sm text-muted-foreground">{chart.description}</p> : null}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {chart.repository.official ? <Badge variant="outline">{copy.artifactHubOfficial}</Badge> : null}
                  {chart.repository.verifiedPublisher ? <Badge variant="outline">{copy.artifactHubVerified}</Badge> : null}
                  {chart.signed ? <Badge variant="outline">{copy.artifactHubSigned}</Badge> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {detailLoading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner decorative />{copy.artifactHubDetailLoading}</div> : null}
        {detail ? (
          <section aria-labelledby="helm-artifacthub-detail" className="grid min-w-0 gap-2 border-t pt-4">
            <h3 className="font-semibold" id="helm-artifacthub-detail">{detail.chart.repository.name}/{detail.chart.name}</h3>
            <p className="break-words text-sm text-muted-foreground">
              {detail.availableVersions.map((item) => item.version).join(", ")}
            </p>
            {detail.readme ? <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">{detail.readme}</pre> : null}
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

function replaceRequest(ref: { current: AbortController | null }): AbortController {
  ref.current?.abort();
  const controller = new AbortController();
  ref.current = controller;
  return controller;
}

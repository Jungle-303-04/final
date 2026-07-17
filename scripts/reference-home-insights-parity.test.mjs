import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, ROOT), "utf8"));
}

async function readText(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

const FEATURE_IDS = [
  ...Array.from(
    { length: 5 },
    (_, index) => `reference.feature.${String(index + 38).padStart(3, "0")}`,
  ),
  ...Array.from(
    { length: 11 },
    (_, index) => `reference.feature.${String(index + 113).padStart(3, "0")}`,
  ),
  "reference.feature.063",
  "reference.feature.065",
];

const IMPLEMENTED = new Set([
  "reference.feature.038",
  "reference.feature.039",
  "reference.feature.040",
  "reference.feature.041",
  "reference.feature.042",
  "reference.feature.063",
  "reference.feature.065",
  "reference.feature.113",
  "reference.feature.114",
  "reference.feature.115",
  "reference.feature.116",
  "reference.feature.117",
  "reference.feature.118",
  "reference.feature.119",
  "reference.feature.120",
  "reference.feature.121",
  "reference.feature.122",
  "reference.feature.123",
]);

const HOME_SOURCE_BANDS = new Set([
  "reference.feature.039",
  "reference.feature.040",
  "reference.feature.041",
]);

const HOME_SOURCE_EVIDENCE = new Map([
  ["web/src/components/home/HomeView.tsx", "0d0af15cf15dea17ca0acadcf01e5a4486e512c1b832e2864b5cf188e2ba065b"],
  ["web/src/components/home/TopologyPreview.tsx", "6f20ee354d8d9a873afcb7e2648a59cdf0b5f44130b5fa296a7e0184e3a6d786"],
  ["web/src/components/home/ActivitySummary.tsx", "d0441196600296ef3aa56c09d5f35356322bfe78e770cf5fe88695411163b06c"],
  ["web/src/components/home/TrafficSummary.tsx", "f6865a6c432ed9ada28b236e1c64cb9cd4e1db136987e25fa4c1fd49c7b7bb4c"],
  ["web/src/components/home/HelmSummary.tsx", "94d4c23f7cba65d0d305979403bacb7ef9a00fc6533a427e1b1db33ff05908fb"],
  ["web/src/components/home/CostCard.tsx", "610f331db7c1b9860ad92fadf8408b40c11e016348ed190e35e89828193bebb1"],
  ["web/src/components/home/CertificateHealthCard.tsx", "fc8e4066154e87e3cd0b90a0cf0bdda559f0dd6a1d714ec5a130bc3cc242ddf1"],
  ["web/src/components/home/NetworkPolicyCoverageCard.tsx", "f500058d50c4fead4ccef4656ddce627c3d3274e1d2d4be402d52d3f52f8272a"],
  ["web/src/components/home/GitOpsControllersCard.tsx", "6fd5fe961d7ead7f35605e5310e377bb960672be549799287862349462d9e045"],
  ["web/src/api/client.ts", "247084c79f8de3229492fc24738371b3ad9b44ee6bb51244c2044f6ca737415f"],
  ["internal/server/dashboard.go", "b3cd6345ea096685a4a8c76e50f2a50fa5888cf9081a0eeca047cbe15edb755f"],
  ["internal/server/dashboard_gitops.go", "ae376fc4278b359105ab8002ab97ba68e055e58ffa1416d1f04d5a8d6d0b7298"],
]);

test("Home, Issues, Applications, Topology, and Timeline rows own one source decision", async () => {
  const [ports, aliases, classifications, ledger] = await Promise.all([
    readJson("docs/migration/reference-feature-port-map.json"),
    readJson("docs/migration/reference-feature-source-aliases.json"),
    readJson("docs/migration/reference-ui-delta-classifications.json"),
    readJson("docs/migration/reference-feature-ledger.json"),
  ]);
  const sourceOwners = new Map();
  for (const [path, classification] of Object.entries(classifications.classifications)) {
    for (const interaction of classification.interactions ?? []) {
      for (const contractId of interaction.legacyContractIds ?? []) {
        assert.equal(sourceOwners.has(contractId), false, `${contractId} source owner is duplicated`);
        sourceOwners.set(contractId, { path, sourceKey: interaction.sourceKey });
      }
    }
  }
  const ledgerById = new Map(
    ledger.features.map((feature) => [feature.contractId, feature]),
  );

  for (const contractId of FEATURE_IDS) {
    const port = ports.features[contractId];
    const sourceKey = aliases.aliases[contractId];
    const feature = ledgerById.get(contractId);
    assert.ok(port, `${contractId} requires an explicit port decision`);
    assert.match(sourceKey, /^upstream-ui:[a-z0-9][a-z0-9:-]+:v1$/, contractId);
    assert.equal(sourceOwners.get(contractId)?.sourceKey, sourceKey, contractId);
    assert.equal(feature?.sourceKey, sourceKey, contractId);
    assert.equal(feature?.deliveryStatus, port.deliveryStatus, contractId);
    assert.ok(port.coverage?.backend, `${contractId} requires backend coverage`);
    assert.ok(port.coverage?.frontend, `${contractId} requires frontend coverage`);

    if (IMPLEMENTED.has(contractId)) {
      assert.equal(port.deliveryStatus, "implemented", contractId);
      assert.ok(
        ["implemented", "not_required"].includes(port.coverage.backend.state),
        contractId,
      );
      assert.equal(port.coverage.frontend.state, "implemented", contractId);
    } else {
      assert.equal(port.deliveryStatus, "in_progress", contractId);
    }
  }
});

test("Home source bands own exact immutable source evidence and implemented ports", async () => {
  const [ports, aliases, classifications, sourceLedger] = await Promise.all([
    readJson("docs/migration/reference-feature-port-map.json"),
    readJson("docs/migration/reference-feature-source-aliases.json"),
    readJson("docs/migration/reference-ui-delta-classifications.json"),
    readJson("docs/migration/reference-source-ledger.json"),
  ]);
  const sourceByPath = new Map(sourceLedger.files.map((file) => [file.path, file]));
  const interactions = Object.entries(classifications.classifications)
    .flatMap(([path, classification]) => (
      (classification.interactions ?? []).map((interaction) => ({ interaction, path }))
    ));

  for (const contractId of HOME_SOURCE_BANDS) {
    const port = ports.features[contractId];
    const sourceKey = aliases.aliases[contractId];
    const owner = interactions.find(({ interaction }) => interaction.sourceKey === sourceKey);

    assert.equal(port.deliveryStatus, "implemented", contractId);
    assert.equal(port.coverage.backend.state, "implemented", contractId);
    assert.equal(port.coverage.frontend.state, "implemented", contractId);
    assert.equal(owner?.path, "web/src/components/home/HomeView.tsx", contractId);
    assert.equal(owner?.interaction.opsiaPort.state, "in_progress", contractId);
    assert.equal(owner?.interaction.opsiaPort.blockedReason, null, contractId);
  }
  for (const [path, sha256] of HOME_SOURCE_EVIDENCE) {
    assert.equal(sourceByPath.get(path)?.sha256, sha256, path);
  }
});

test("server polling, last-success retention, and Timeline SSE stay contractual", async () => {
  const [
    ports,
    applications,
    clusterConnection,
    clusterConnectionSchema,
    home,
    refreshScheduler,
    timelineApi,
    timelineFrame,
  ] = await Promise.all([
    readJson("docs/migration/reference-feature-port-map.json"),
    readText("frontend/src/features/applications/useApplicationsData.ts"),
    readText("frontend/src/pages/clusters/ClusterConnectDialog.tsx"),
    readText("frontend/src/api/cluster-connection-schemas.ts"),
    readText("frontend/src/pages/home/homePageStateModel.ts"),
    readText("frontend/src/shared/data/serverRefreshScheduler.ts"),
    readText("frontend/src/api/timeline.ts"),
    readText("frontend/src/pages/timeline/useTimelineDataFrame.ts"),
  ]);

  assert.match(applications, /useServerRefreshScheduler/);
  assert.match(applications, /loadApplicationsRefreshPolicy/);
  assert.match(applications, /acceptSuccess/);
  assert.match(applications, /refreshFailure/);
  assert.match(refreshScheduler, /visibilitychange/);
  assert.match(clusterConnectionSchema, /refresh_after_seconds/);
  assert.match(clusterConnection, /refreshAfterSeconds/);
  assert.doesNotMatch(clusterConnection, /POLL_INTERVAL/);
  assert.match(home, /resourceFailure/);
  assert.match(home, /asyncResourceFailure/);
  assert.match(timelineApi, /last-event-id/);
  assert.match(timelineFrame, /createRafStreamCoalescer/);
  assert.match(timelineFrame, /resync_required/);
  assert.equal(ports.features["reference.feature.119"].coverage.realtime.state, "implemented");
});

test("deferred-ready owns its immutable source and exact authorized stream evidence", async () => {
  const [ports, aliases, classifications, ledger, sourceLedger] = await Promise.all([
    readJson("docs/migration/reference-feature-port-map.json"),
    readJson("docs/migration/reference-feature-source-aliases.json"),
    readJson("docs/migration/reference-ui-delta-classifications.json"),
    readJson("docs/migration/reference-feature-ledger.json"),
    readJson("docs/migration/reference-source-ledger.json"),
  ]);
  const contractId = "reference.feature.063";
  const sourceKey = "upstream-ui:home:deferred-ready:dashboard-refetch:v1";
  const port = ports.features[contractId];
  const feature = ledger.features.find((candidate) => candidate.contractId === contractId);
  const interaction = classifications.classifications["web/src/hooks/useEventSource.ts"]
    .interactions.find((candidate) => candidate.sourceKey === sourceKey);
  const sourceByPath = new Map(sourceLedger.files.map((file) => [file.path, file]));

  assert.equal(aliases.aliases[contractId], sourceKey);
  assert.equal(port.deliveryStatus, "implemented");
  assert.equal(port.backendContract, "packages.contracts.freshness.HomeDashboardEventFrame");
  assert.equal(port.frontendContract, "frontend/src/features/home/homeEndpointContract.ts");
  assert.equal(port.coverage.backend.state, "implemented");
  assert.equal(port.coverage.frontend.state, "implemented");
  assert.equal(port.coverage.realtime.state, "implemented");
  assert.equal(feature.deliveryStatus, "implemented");
  assert.equal(feature.sourceKey, sourceKey);
  assert.deepEqual(interaction.legacyContractIds, [contractId]);
  assert.ok(interaction.opsiaPort.destinations.includes(
    "src/domains/dashboard/ready_stream.py",
  ));
  assert.ok(interaction.opsiaPort.destinations.includes(
    "frontend/src/features/home/createHomeAdapter.ts",
  ));
  assert.equal(sourceByPath.get("internal/server/sse.go")?.disposition, "python-port");
  assert.equal(sourceByPath.get("web/src/hooks/useEventSource.ts")?.disposition, "frontend-port");
});

test("workspace audit findings reuse the outbound Agent Checks projection", async () => {
  const [ports, aliases, classifications, checksRouter, checksProjection, checksPage] =
    await Promise.all([
      readJson("docs/migration/reference-feature-port-map.json"),
      readJson("docs/migration/reference-feature-source-aliases.json"),
      readJson("docs/migration/reference-ui-delta-classifications.json"),
      readText("src/domains/checks/router.py"),
      readText("src/domains/checks/observation_projection.py"),
      readText("frontend/src/pages/checks/ChecksPage.tsx"),
    ]);
  const contractId = "reference.feature.120";
  const sourceKey = "upstream-ui:audit:workspace:observed-findings:v1";
  const interaction = classifications.classifications["web/src/api/client.ts"].interactions
    .find((candidate) => candidate.sourceKey === sourceKey);
  const port = ports.features[contractId];

  assert.equal(aliases.aliases[contractId], sourceKey);
  assert.equal(interaction?.opsiaPort.state, "in_progress");
  assert.equal(port.deliveryStatus, "implemented");
  assert.equal(port.coverage.backend.state, "implemented");
  assert.equal(port.coverage.frontend.state, "implemented");
  assert.match(checksRouter, /latest_inventory_snapshots/u);
  assert.match(checksProjection, /source\.get\("checks_observation"\)/u);
  assert.match(checksPage, /alertEventResourceHref/u);
  assert.doesNotMatch(checksRouter, /\/audit/u);
});

test("dashboard source response is normalized into independent Home sections", async () => {
  const [ports, adapter, frame, responses] = await Promise.all([
    readJson("docs/migration/reference-feature-port-map.json"),
    readText("frontend/src/features/home/createHomeAdapter.ts"),
    readText("frontend/src/pages/home/useHomeClusterFrame.ts"),
    readText("src/packages/contracts/gateway/responses.py"),
  ]);
  const port = ports.features["reference.feature.113"];

  assert.equal(port.deliveryStatus, "implemented");
  assert.equal(port.coverage.backend.state, "implemented");
  assert.equal(port.coverage.frontend.state, "implemented");
  assert.equal(port.coverage.realtime.state, "implemented");
  assert.match(adapter, /loadClusterOverview\(clusterId, signal\)/u);
  assert.match(adapter, /loadInsights\(clusterId, signal\)/u);
  assert.match(adapter, /loadNodes\(clusterId, signal\)/u);
  assert.match(adapter, /loadNodePods\(clusterId, nodeName, signal\)/u);
  assert.match(frame, /resourceFailure\(currentSection, failure\)/u);
  assert.match(frame, /isCurrentFrame\(current, scopeKey, revision\)/u);
  assert.match(responses, /class ClusterSummaryDetailResponse\(StrictModel\):/u);
});

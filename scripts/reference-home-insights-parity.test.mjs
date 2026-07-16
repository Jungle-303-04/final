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
  "reference.feature.065",
];

const IMPLEMENTED = new Set([
  "reference.feature.042",
  "reference.feature.065",
  "reference.feature.114",
  "reference.feature.115",
  "reference.feature.117",
  "reference.feature.119",
  "reference.feature.123",
]);

const PROVIDER_BLOCKED = new Set([
  "reference.feature.039",
  "reference.feature.040",
  "reference.feature.041",
  "reference.feature.121",
  "reference.feature.122",
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

test("unavailable Home providers and settings mutations remain explicit", async () => {
  const ports = await readJson("docs/migration/reference-feature-port-map.json");
  for (const contractId of PROVIDER_BLOCKED) {
    const blocked = Object.values(ports.features[contractId].coverage)
      .filter((item) => item?.state === "blocked");
    assert.ok(blocked.length > 0, `${contractId} requires a blocked boundary`);
    assert.ok(
      blocked.every((item) => typeof item.reason === "string" && item.reason.length > 0),
      `${contractId} requires an actionable blocked reason`,
    );
  }
});

test("server polling, last-success retention, and Timeline SSE stay contractual", async () => {
  const [
    ports,
    applications,
    clusterConnection,
    clusterConnectionSchema,
    home,
    timelineApi,
    timelineFrame,
  ] = await Promise.all([
    readJson("docs/migration/reference-feature-port-map.json"),
    readText("frontend/src/features/applications/useApplicationsData.ts"),
    readText("frontend/src/pages/clusters/ClusterConnectDialog.tsx"),
    readText("frontend/src/api/cluster-connection-schemas.ts"),
    readText("frontend/src/pages/home/homePageStateModel.ts"),
    readText("frontend/src/api/timeline.ts"),
    readText("frontend/src/pages/timeline/useTimelineDataFrame.ts"),
  ]);

  assert.match(applications, /APPLICATIONS_REFRESH_INTERVAL_MS = 60_000/);
  assert.match(applications, /visibilitychange/);
  assert.match(applications, /refreshFailure/);
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

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const CONTRACT_ID = "reference.feature.095";
const SOURCE_KEY = "upstream-ui:cluster-info:agent-observation:summary:v1";
const SOURCE_EVIDENCE = [
  {
    path: "web/src/api/client.ts",
    sha256: "247084c79f8de3229492fc24738371b3ad9b44ee6bb51244c2044f6ca737415f",
    symbol: "useClusterInfo",
  },
  {
    path: "internal/server/server.go",
    sha256: "e5df3ea4ea2a5a7e0c8f3e4c63527be12890b84595c909b0631bdd96fb2c4129",
    symbol: "handleClusterInfo",
  },
  {
    path: "internal/k8s/cluster_detection.go",
    sha256: "c5d3b377586adfefb96fca7b041d195ed50d636e292d4954831ee63968fa6cb1",
    symbol: "GetClusterInfo",
  },
];

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, ROOT), "utf8"));
}

async function sourceSha256(relativePath) {
  const source = await readFile(new URL(`references/upstream/${relativePath}`, ROOT));
  return createHash("sha256").update(source).digest("hex");
}

test("cluster info는 frozen 원본의 exact identity를 사용한다", async () => {
  const [aliases, identities, sourceLedger, featureLedger] = await Promise.all([
    readJson("docs/migration/reference-feature-source-aliases.json"),
    readJson("docs/migration/reference-feature-source-identities.json"),
    readJson("docs/migration/reference-source-ledger.json"),
    readJson("docs/migration/reference-feature-ledger.json"),
  ]);

  assert.equal(aliases.aliases[CONTRACT_ID], SOURCE_KEY);
  const identity = identities.identities.find(
    (candidate) => candidate.legacyContractId === CONTRACT_ID,
  );
  assert.equal(identity?.sourceKey, SOURCE_KEY);
  assert.deepEqual(identity?.evidence, SOURCE_EVIDENCE);

  const sourceFiles = new Map(sourceLedger.files.map((file) => [file.path, file]));
  for (const evidence of SOURCE_EVIDENCE) {
    assert.equal(sourceFiles.get(evidence.path)?.sha256, evidence.sha256);
    assert.equal(await sourceSha256(evidence.path), evidence.sha256);
  }

  const feature = featureLedger.features.find(
    (candidate) => candidate.contractId === CONTRACT_ID,
  );
  assert.equal(feature?.sourceKey, SOURCE_KEY);
  assert.equal(feature?.identityStatus, "source-key");
  assert.equal(feature?.deliveryStatus, "implemented");
});

test("cluster info는 outbound Agent 관측과 공용 범위 계약만 재사용한다", async () => {
  const [portMap, targetRouter, clusterContract, homeCanonical, trafficAdapter] =
    await Promise.all([
      readJson("docs/migration/reference-feature-port-map.json"),
      readFile(new URL("src/domains/target/router.py", ROOT), "utf8"),
      readFile(new URL("src/packages/contracts/gateway/responses.py", ROOT), "utf8"),
      readFile(new URL("frontend/src/features/home/homeCanonical.ts", ROOT), "utf8"),
      readFile(new URL("frontend/src/features/traffic/createTrafficAdapter.ts", ROOT), "utf8"),
    ]);
  const port = portMap.features[CONTRACT_ID];

  assert.equal(port.backendContract, "packages.contracts.gateway.responses.ClusterSummary");
  assert.equal(
    port.frontendContract,
    "frontend/src/features/home/homeEndpointContract.ts#HomeEndpointClusterSummary",
  );
  assert.equal(port.desktopContract, null);
  assert.equal(port.coverage.backend.destination, "src/domains/target/router.py#cluster_summary");
  assert.equal(
    port.coverage.backend.consumer,
    "src/domains/target/router.py#cluster_observation_metadata",
  );

  assert.match(targetRouter, /snapshot_source_summary\(latest_snapshot\)/u);
  assert.match(targetRouter, /traffic_sources\.get\("cluster"\)/u);
  assert.match(targetRouter, /complete_inventory_snapshot\(latest_snapshot\)/u);
  assert.match(clusterContract, /class ClusterSummary\(StrictModel\):/u);
  assert.match(clusterContract, /crd_discovery_status: Literal\["exact", "partial", "unavailable"\]/u);
  assert.match(homeCanonical, /kubernetesVersion: canonicalOptionalIdentity/u);
  assert.match(homeCanonical, /namespaceCount/u);
  assert.match(trafficAdapter, /kubernetesVersion: catalog\.cluster\.kubernetes_version/u);
  assert.doesNotMatch(targetRouter, /\/cluster-info/u);
});

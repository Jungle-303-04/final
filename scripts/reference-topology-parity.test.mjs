import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const CONTRACT_ID = "reference.feature.118";
const SOURCE_KEY = "upstream-ui:topology:graph:evidence-graph:v1";
const SOURCE_PATH = "packages/k8s-ui/src/components/topology/TopologyGraph.tsx";
const SOURCE_SHA = "023dcb64a4836e8ca5de7c64e12c9881d8923508cf28c9149c0b8707f7d4966d";

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, ROOT), "utf8"));
}

async function readText(relativePath) {
  return readFile(new URL(relativePath, ROOT), "utf8");
}

test("relation topology는 frozen graph 원본과 정규 계약을 연결한다", async () => {
  const [aliases, classifications, sourceLedger, featureLedger, source] = await Promise.all([
    readJson("docs/migration/reference-feature-source-aliases.json"),
    readJson("docs/migration/reference-ui-delta-classifications.json"),
    readJson("docs/migration/reference-source-ledger.json"),
    readJson("docs/migration/reference-feature-ledger.json"),
    readFile(new URL(`references/upstream/${SOURCE_PATH}`, ROOT)),
  ]);
  const interaction = classifications.classifications[SOURCE_PATH].interactions
    .find((candidate) => candidate.sourceKey === SOURCE_KEY);
  const feature = featureLedger.features.find(
    (candidate) => candidate.contractId === CONTRACT_ID,
  );

  assert.equal(aliases.aliases[CONTRACT_ID], SOURCE_KEY);
  assert.deepEqual(interaction?.legacyContractIds, [CONTRACT_ID]);
  assert.equal(sourceLedger.files.find((file) => file.path === SOURCE_PATH)?.sha256, SOURCE_SHA);
  assert.equal(createHash("sha256").update(source).digest("hex"), SOURCE_SHA);
  assert.equal(feature?.sourceKey, SOURCE_KEY);
  assert.equal(feature?.deliveryStatus, "implemented");
});

test("relation topology는 저장된 inventory evidence와 공용 Resources 화면만 재사용한다", async () => {
  const [ports, router, contracts, graph, canonical, dataFrame, productRoutes] =
    await Promise.all([
      readJson("docs/migration/reference-feature-port-map.json"),
      readText("src/domains/inventory_filter/router.py"),
      readText("src/packages/contracts/gateway/responses.py"),
      readText("src/domains/inventory_filter/graph.py"),
      readText("frontend/src/features/resources/relationTopologyCanonical.ts"),
      readText("frontend/src/pages/resources/useRelationTopologyDataFrame.ts"),
      readText("frontend/src/app/productRoutes.ts"),
    ]);
  const port = ports.features[CONTRACT_ID];

  assert.equal(
    port.backendContract,
    "packages.contracts.gateway.responses.RelationsTopologyResponse",
  );
  assert.equal(
    port.frontendContract,
    "frontend/src/features/resources/relationTopologyContract.ts",
  );
  assert.equal(port.desktopContract, null);
  assert.equal(port.coverage.backend.state, "implemented");
  assert.equal(port.coverage.frontend.state, "implemented");
  assert.match(router, /view: Literal\["physical", "relations"\]/u);
  assert.match(router, /at_revision=target_revision/u);
  assert.match(contracts, /class RelationsTopologyResponse\(ResourceGraphSnapshotResponse\):/u);
  assert.match(contracts, /omitted_node_count: int = Field\(ge=0\)/u);
  assert.match(graph, /evidence_type="owner_reference"/u);
  assert.match(graph, /graph_node_budget_exceeded/u);
  assert.match(canonical, /relationCompleteness: value\.relation_completeness/u);
  assert.match(dataFrame, /controller\.abort\(\)/u);
  assert.match(dataFrame, /requestSequence\.current !== requestId/u);
  assert.doesNotMatch(productRoutes, /path:\s*["']\/topology/u);
});

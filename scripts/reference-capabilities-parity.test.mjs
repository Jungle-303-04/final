import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const CONTRACT_ID = "reference.feature.096";
const SOURCE_KEY = "upstream-ui:capabilities:rbac:resource-authority:v1";
const SOURCE_EVIDENCE = [
  {
    path: "internal/k8s/capabilities.go",
    sha256: "58fc4ee7d6c8be58ed5baf4ebd88e36c71e68572abb83591392a1623cad7d425",
    symbol: "CheckCapabilities",
  },
  {
    path: "internal/server/server.go",
    sha256: "e5df3ea4ea2a5a7e0c8f3e4c63527be12890b84595c909b0631bdd96fb2c4129",
    symbol: "handleCapabilities",
  },
  {
    path: "packages/k8s-ui/src/types/core.ts",
    sha256: "b53c9adbfec3c03a8999a2757cc036b76f0932228e1bd33e0fa99a876fe216d1",
    symbol: "Capabilities",
  },
  {
    path: "web/src/api/client.ts",
    sha256: "247084c79f8de3229492fc24738371b3ad9b44ee6bb51244c2044f6ca737415f",
    symbol: "useCapabilities",
  },
];

const AUTHORITY_TESTS = [
  "scripts/reference-capabilities-parity.test.mjs",
  "tests/test_helm_release_router.py",
  "tests/test_kubernetes_api_discovery_contract.py",
  "tests/test_log_stream.py",
  "tests/test_resource_capabilities_router.py",
  "tests/test_service_access_router.py",
  "tests/test_target_agent_commands.py",
  "frontend/src/api/api-resource-discovery.test.ts",
  "frontend/src/api/log-stream.test.ts",
  "frontend/src/api/resource-capabilities.test.ts",
  "frontend/src/api/service-access.test.ts",
  "frontend/src/pages/helm/HelmPage.test.tsx",
  "frontend/src/pages/resources/ResourceDetailActions.operationHandoff.test.tsx",
  "frontend/src/pages/resources/ServiceAccessActions.test.tsx",
];

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, ROOT), "utf8"));
}

async function sha256(relativePath) {
  const source = await readFile(new URL(`references/upstream/${relativePath}`, ROOT));
  return createHash("sha256").update(source).digest("hex");
}

test("reference.feature.096은 frozen capability 원본의 exact identity를 사용한다", async () => {
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
    assert.equal(await sha256(evidence.path), evidence.sha256);
  }

  const feature = featureLedger.features.find(
    (candidate) => candidate.contractId === CONTRACT_ID,
  );
  assert.equal(feature?.sourceKey, SOURCE_KEY);
  assert.equal(feature?.identityStatus, "source-key");
  assert.equal(feature?.deliveryStatus, "implemented");
});

test("capability port는 resource RBAC와 outbound agent authority를 재사용한다", async () => {
  const [portMap, featureLedger, inventoryRouter, actionCatalog, frontendPort] =
    await Promise.all([
      readJson("docs/migration/reference-feature-port-map.json"),
      readJson("docs/migration/reference-feature-ledger.json"),
      readFile(new URL("src/domains/inventory/router.py", ROOT), "utf8"),
      readFile(new URL("src/domains/inventory/action_catalog.py", ROOT), "utf8"),
      readFile(new URL("frontend/src/api/resource-capabilities.ts", ROOT), "utf8"),
    ]);
  const port = portMap.features[CONTRACT_ID];
  const feature = featureLedger.features.find(
    (candidate) => candidate.contractId === CONTRACT_ID,
  );

  assert.equal(
    port.backendContract,
    "packages.contracts.gateway.responses.ResourceCapabilitiesResponse",
  );
  assert.equal(
    port.frontendContract,
    "frontend/src/features/resources/resourceCapabilitiesContract.ts",
  );
  assert.equal(port.desktopContract, null);
  assert.deepEqual(port.verification, AUTHORITY_TESTS);
  assert.equal(feature?.coverage.backend.destination, "src/domains/inventory/router.py#get_resource_capabilities");
  assert.equal(
    feature?.coverage.backend.consumer,
    "src/domains/inventory/capabilities.py#resource_capabilities_response",
  );
  assert.equal(
    feature?.coverage.frontend.consumer,
    "frontend/src/api/resource-capabilities.ts#getResourceCapabilities",
  );

  assert.match(inventoryRouter, /resource: str = Query\(min_length=1, max_length=255\)/u);
  assert.match(inventoryRouter, /get_inventory_resource_by_key/u);
  assert.match(actionCatalog, /applicable_resource_actions/u);
  assert.match(actionCatalog, /agent_capability/u);
  assert.match(frontendPort, /getResourceCapabilities\(\s*resource: string/u);
  assert.doesNotMatch(frontendPort, /namespace\?: string/u);
});

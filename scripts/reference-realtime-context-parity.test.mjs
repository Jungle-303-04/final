import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const CONTRACT_IDS = [
  "reference.feature.061",
  "reference.feature.062",
  "reference.feature.224",
];
const SOURCE_KEY = "upstream-ui:events:scoped:durable-streams:v1";
const SOURCE_EVIDENCE = [
  {
    path: "web/src/hooks/useEventSource.ts",
    sha256: "6a6e8e36d16083045264a87f8a75c443181ddbd40f6a118f47e37bf6404b488a",
    symbol: "useEventSource",
  },
  {
    path: "internal/server/sse.go",
    sha256: "885e7ece397603b1283036adcb8faaff7db7b95382bc75c31141407582d879ed",
    symbol: "registerContextSwitchCallback",
  },
];

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, ROOT), "utf8"));
}

async function sourceSha256(relativePath) {
  const source = await readFile(new URL(`references/upstream/${relativePath}`, ROOT));
  return createHash("sha256").update(source).digest("hex");
}

test("realtime context 기능은 frozen 원본의 exact identity를 공유한다", async () => {
  const [aliases, identities, sourceLedger, featureLedger] = await Promise.all([
    readJson("docs/migration/reference-feature-source-aliases.json"),
    readJson("docs/migration/reference-feature-source-identities.json"),
    readJson("docs/migration/reference-source-ledger.json"),
    readJson("docs/migration/reference-feature-ledger.json"),
  ]);

  for (const contractId of CONTRACT_IDS) {
    assert.equal(aliases.aliases[contractId], SOURCE_KEY);
    const feature = featureLedger.features.find(
      (candidate) => candidate.contractId === contractId,
    );
    assert.equal(feature?.sourceKey, SOURCE_KEY);
    assert.equal(feature?.identityStatus, "source-key");
    assert.equal(feature?.deliveryStatus, "implemented");
  }
  const identitiesForSource = identities.identities.filter(
    (candidate) => candidate.sourceKey === SOURCE_KEY,
  );
  assert.equal(identitiesForSource.length, CONTRACT_IDS.length);
  for (const identity of identitiesForSource) {
    assert.deepEqual(identity.evidence, SOURCE_EVIDENCE);
  }

  const sourceFiles = new Map(sourceLedger.files.map((file) => [file.path, file]));
  for (const evidence of SOURCE_EVIDENCE) {
    assert.equal(sourceFiles.get(evidence.path)?.sha256, evidence.sha256);
    assert.equal(await sourceSha256(evidence.path), evidence.sha256);
  }
});

test("scope context는 공용 event stream과 outbound authority만 사용한다", async () => {
  const [portMap, readyStream, adapter, provider, operationEvents] = await Promise.all([
    readJson("docs/migration/reference-feature-port-map.json"),
    readFile(new URL("src/domains/dashboard/ready_stream.py", ROOT), "utf8"),
    readFile(new URL("frontend/src/features/home/createHomeAdapter.ts", ROOT), "utf8"),
    readFile(new URL("frontend/src/features/cluster-scope/ClusterScopeProvider.tsx", ROOT), "utf8"),
    readFile(new URL("src/packages/runtime/operation_events.py", ROOT), "utf8"),
  ]);

  for (const contractId of CONTRACT_IDS) {
    const port = portMap.features[contractId];
    assert.equal(port.deliveryStatus, "implemented");
    assert.equal(port.coverage.backend.state, "implemented");
    assert.equal(port.coverage.frontend.state, "implemented");
    assert.equal(port.coverage.realtime.state, "implemented");
  }
  assert.match(readyStream, /default="30"/u);
  assert.match(adapter, /phase: "context_switch_progress"/u);
  assert.match(adapter, /phase: "context_changed"/u);
  assert.match(adapter, /MAX_SCOPE_RECONNECT_DELAY_MS = 30_000/u);
  assert.match(provider, /scopeInvalidationRevision/u);
  assert.match(provider, /signal\.aborted \|\| !sameScope/u);
  assert.match(operationEvents, /OPERATION_EVENT_RECONNECT_MAX_SECONDS = 30\.0/u);
  assert.doesNotMatch(adapter, /port-?forward|prometheus|kubernetes/u);
});

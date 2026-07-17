import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  validateFeatureLedger,
  validateFeatureSourceAuthority,
} from "./reference-feature-ledger.mjs";

const ROOT = new URL("../", import.meta.url);
const REVISION = "cf643dfee93a5ae8dfcd3c2a982620b793b2b4cc";
const DELTA_KEY = "upstream-ui:shell:scope:selection:v1";
const SNAPSHOT_KEY = "upstream-ui:nodes:drain:confirm-and-progress:v1";

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, ROOT), "utf8"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function authorityFixture(source) {
  const digest = sha256(source);
  return {
    sourceRevision: REVISION,
    aliases: {
      schemaVersion: 1,
      sourceRevision: REVISION,
      aliases: {
        "reference.feature.001": DELTA_KEY,
        "reference.feature.002": SNAPSHOT_KEY,
      },
    },
    deltaClassifications: {
      schemaVersion: 3,
      targetRevision: REVISION,
      classifications: {
        "web/src/shell.ts": {
          interactions: [
            {
              sourceKey: DELTA_KEY,
              legacyContractIds: ["reference.feature.001"],
            },
          ],
        },
      },
    },
    snapshotIdentities: {
      schemaVersion: 1,
      sourceRevision: REVISION,
      identities: [
        {
          sourceKey: SNAPSHOT_KEY,
          legacyContractId: "reference.feature.002",
          evidence: [
            {
              path: "web/src/actions.ts",
              sha256: digest,
              symbol: "useDrainNode",
            },
          ],
          interaction: "one exact node drain confirmation emits durable progress",
        },
      ],
    },
    featureLedger: {
      schemaVersion: 1,
      sourceRevision: REVISION,
      featureCount: 2,
      features: [
        {
          contractId: "reference.feature.001",
          sourceKey: DELTA_KEY,
          deliveryStatus: "implemented",
        },
        {
          contractId: "reference.feature.002",
          sourceKey: SNAPSHOT_KEY,
          deliveryStatus: "implemented",
        },
      ],
    },
    sourceLedger: {
      schemaVersion: 2,
      sourceRevision: REVISION,
      files: [
        {
          path: "web/src/actions.ts",
          sha256: digest,
        },
      ],
    },
  };
}

test("모든 alias는 delta 또는 full snapshot 권위 중 정확히 하나에 연결된다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "source-identity-"));
  const source = "export function useDrainNode() {}\n";
  try {
    await writeFile(path.join(directory, "actions.ts"), source);
    const fixture = authorityFixture(source);
    fixture.snapshotIdentities.identities[0].evidence[0].path = "actions.ts";
    fixture.sourceLedger.files[0].path = "actions.ts";

    assert.deepEqual(
      await validateFeatureSourceAuthority({
        ...fixture,
        frozenSource: directory,
      }),
      [],
    );

    fixture.snapshotIdentities.identities[0].sourceKey = DELTA_KEY;
    const ambiguous = await validateFeatureSourceAuthority({
      ...fixture,
      frozenSource: directory,
    });
    assert.ok(ambiguous.some((error) => error.includes("exactly one source identity")));
    assert.ok(ambiguous.some((error) => error.includes("sourceKey is duplicated")));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("full snapshot 권위는 중복 contract와 sourceKey를 거부한다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "source-identity-"));
  const source = "export function useDrainNode() {}\n";
  try {
    await writeFile(path.join(directory, "actions.ts"), source);
    const fixture = authorityFixture(source);
    const identity = fixture.snapshotIdentities.identities[0];
    identity.evidence[0].path = "actions.ts";
    fixture.sourceLedger.files[0].path = "actions.ts";
    fixture.snapshotIdentities.identities.push(
      structuredClone(identity),
      {
        ...structuredClone(identity),
        sourceKey: "upstream-ui:nodes:debug-terminal:session-lifecycle:v1",
      },
    );

    const errors = await validateFeatureSourceAuthority({
      ...fixture,
      frozenSource: directory,
    });
    assert.ok(errors.some((error) => error.includes("sourceKey is duplicated")));
    assert.ok(errors.some((error) => error.includes("legacyContractId is duplicated")));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("full snapshot evidence path와 SHA는 source ledger와 실제 파일에 닫혀 있다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "source-identity-"));
  const source = "export function useDrainNode() {}\n";
  try {
    await writeFile(path.join(directory, "actions.ts"), source);
    const fixture = authorityFixture(source);
    fixture.snapshotIdentities.identities[0].evidence[0] = {
      path: "actions.ts",
      sha256: "0".repeat(64),
      symbol: "useDrainNode",
    };
    fixture.sourceLedger.files[0].path = "actions.ts";

    const errors = await validateFeatureSourceAuthority({
      ...fixture,
      frozenSource: directory,
    });
    assert.ok(errors.some((error) => error.includes("source ledger SHA mismatch")));
    assert.ok(errors.some((error) => error.includes("frozen source SHA mismatch")));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("implemented feature는 source identity 없이는 생성될 수 없다", () => {
  const errors = validateFeatureLedger({
    schemaVersion: 1,
    sourceRevision: REVISION,
    featureCount: 1,
    features: [
      {
        id: "reference-feature-001",
        contractId: "reference.feature.001",
        sourceKey: null,
        legacyContractIds: ["reference.feature.001"],
        identityStatus: "legacy-unmapped",
        section: "API",
        line: 1,
        cells: ["GET /resources"],
        endpoints: ["GET /resources"],
        streaming: false,
        area: "resources",
        releasePhase: "baseline",
        deliveryStatus: "implemented",
        backendContract: "domains.resources",
        frontendContract: "frontend/src/pages/resources",
        desktopContract: null,
        verification: ["scripts/reference-feature-source-identity.test.mjs"],
        coverage: {
          backend: { state: "implemented" },
          frontend: { state: "implemented" },
          desktop: null,
          realtime: "not_required",
        },
      },
    ],
  });

  assert.ok(errors.some((error) => error.includes("implemented source identity is required")));
});

test("전역 셸 016·017·019·020·100은 공용 UI와 분산 세션 권위로 닫힌다", async () => {
  const [aliases, identities, portMap, featureLedger] = await Promise.all([
    readJson("docs/migration/reference-feature-source-aliases.json"),
    readJson("docs/migration/reference-feature-source-identities.json"),
    readJson("docs/migration/reference-feature-port-map.json"),
    readJson("docs/migration/reference-feature-ledger.json"),
  ]);
  const expected = new Map([
    ["reference.feature.016", "upstream-ui:app-shell:omnibar-and-command:single-authority:v1"],
    ["reference.feature.017", "upstream-ui:app-shell:utilities-and-overlays:focus-authority:v1"],
    ["reference.feature.019", "upstream-ui:app-shell:sessions:dock-and-switch-guard:v1"],
    ["reference.feature.020", "upstream-ui:app-shell:utilities-and-overlays:focus-authority:v1"],
    ["reference.feature.100", "upstream-ui:app-shell:sessions:dock-and-switch-guard:v1"],
  ]);
  const identityKeys = new Set(identities.identities.map((identity) => identity.sourceKey));
  const features = new Map(featureLedger.features.map((feature) => [feature.contractId, feature]));
  for (const [contractId, sourceKey] of expected) {
    assert.equal(aliases.aliases[contractId], sourceKey);
    assert.equal(features.get(contractId)?.sourceKey, sourceKey);
    assert.equal(features.get(contractId)?.deliveryStatus, "implemented");
    assert.equal(portMap.features[contractId]?.deliveryStatus, "implemented");
    assert.ok(identityKeys.has(sourceKey));
  }
  assert.equal(
    portMap.features["reference.feature.100"].coverage.backend.state,
    "not_required",
  );
  assert.match(
    portMap.features["reference.feature.100"].coverage.backend.reason,
    /distributed/u,
  );
});

test("리소스 유지보수 174~176은 frozen snapshot exact identity를 사용한다", async () => {
  const [aliases, classifications, identities, sourceLedger, featureLedger] =
    await Promise.all([
      readJson("docs/migration/reference-feature-source-aliases.json"),
      readJson("docs/migration/reference-ui-delta-classifications.json"),
      readJson("docs/migration/reference-feature-source-identities.json"),
      readJson("docs/migration/reference-source-ledger.json"),
      readJson("docs/migration/reference-feature-ledger.json"),
    ]);
  const expected = new Map([
    ["reference.feature.174", "upstream-ui:nodes:drain:confirm-and-progress:v1"],
    [
      "reference.feature.175",
      "upstream-ui:pods:debug-terminal:ephemeral-container:v1",
    ],
    [
      "reference.feature.176",
      "upstream-ui:nodes:debug-terminal:session-lifecycle:v1",
    ],
  ]);
  const generic = classifications.classifications[
    "packages/k8s-ui/src/components/shared/ResourceActionsBar.tsx"
  ].interactions.find(
    (interaction) =>
      interaction.sourceKey ===
      "upstream-ui:resources:actions:capability-command-and-log-composition:v1",
  );
  assert.deepEqual(generic.legacyContractIds, ["reference.feature.158"]);

  const byContract = new Map(
    identities.identities.map((identity) => [identity.legacyContractId, identity]),
  );
  const features = new Map(
    featureLedger.features.map((feature) => [feature.contractId, feature]),
  );
  for (const [contractId, sourceKey] of expected) {
    assert.equal(aliases.aliases[contractId], sourceKey);
    assert.equal(byContract.get(contractId)?.sourceKey, sourceKey);
    assert.equal(features.get(contractId)?.sourceKey, sourceKey);
    assert.equal(features.get(contractId)?.streaming, true);
    assert.equal(features.get(contractId)?.coverage.realtime.state, "implemented");
  }

  assert.deepEqual(
    await validateFeatureSourceAuthority({
      sourceRevision: REVISION,
      aliases,
      deltaClassifications: classifications,
      snapshotIdentities: identities,
      featureLedger,
      sourceLedger,
      frozenSource: path.join(new URL("references/upstream", ROOT).pathname),
    }),
    [],
  );
});

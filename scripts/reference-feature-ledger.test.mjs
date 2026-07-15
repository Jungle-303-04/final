import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parseReferenceInventory,
  validateFeatureLedger,
  writeFeatureLedger,
} from "./reference-feature-ledger.mjs";

const REVISION = "cf643dfee93a5ae8dfcd3c2a982620b793b2b4cc";

test("원본 인벤토리의 모든 표 행을 backend/frontend/streaming 계약으로 매핑한다", () => {
  const ledger = parseReferenceInventory(
    [
      "# inventory",
      "## 전역 셸",
      "| 영역 | 동작 |",
      "|---|---|",
      "| 명령 팔레트 | 단축키 |",
      "## API",
      "| Method·path | 요청 |",
      "|---|---|",
      "| `GET /resources` | `namespaces?` |",
      "| `SSE /events/stream`, `WS /pods/{name}/exec` | 없음 |",
    ].join("\n"),
    REVISION,
  );

  assert.deepEqual(
    ledger.features.map(({ id, contractId, section, endpoints, streaming, backendContract, frontendContract }) => ({
      id,
      contractId,
      section,
      endpoints,
      streaming,
      backendContract,
      frontendContract,
    })),
    [
      {
        id: "reference-feature-001",
        contractId: "reference.feature.001",
        section: "전역 셸",
        endpoints: [],
        streaming: false,
        backendContract: "packages.contracts.parity",
        frontendContract: "frontend/src/shared/parity/referenceParity.ts",
      },
      {
        id: "reference-feature-002",
        contractId: "reference.feature.002",
        section: "API",
        endpoints: ["GET /resources"],
        streaming: false,
        backendContract: "packages.contracts.parity",
        frontendContract: "frontend/src/shared/parity/referenceParity.ts",
      },
      {
        id: "reference-feature-003",
        contractId: "reference.feature.003",
        section: "API",
        endpoints: ["SSE /events/stream", "WS /pods/{name}/exec"],
        streaming: true,
        backendContract: "packages.contracts.parity",
        frontendContract: "frontend/src/shared/parity/referenceParity.ts",
      },
    ],
  );
  assert.deepEqual(validateFeatureLedger(ledger), []);
});

test("feature ledger는 누락된 계약과 중복 ID를 거부한다", () => {
  const errors = validateFeatureLedger({
    schemaVersion: 1,
    sourceRevision: REVISION,
    featureCount: 2,
    features: [
      {
        id: "reference-feature-001",
        contractId: "reference.feature.001",
        section: "API",
        line: 1,
        cells: ["`GET /health`"],
        endpoints: ["GET /health"],
        streaming: false,
        backendContract: "",
        frontendContract: "",
        verification: [],
      },
      {
        id: "reference-feature-001",
        contractId: "reference.feature.002",
        section: "API",
        line: 2,
        cells: ["`GET /readyz`"],
        endpoints: ["GET /readyz"],
        streaming: false,
        backendContract: "packages.contracts.parity",
        frontendContract: "frontend/src/shared/parity/referenceParity.ts",
        verification: ["scripts/reference-feature-ledger.test.mjs"],
      },
    ],
  });

  assert.deepEqual(errors, [
    "reference-feature-001: backendContract is required",
    "reference-feature-001: frontendContract is required",
    "reference-feature-001: at least one verification target is required",
    "reference-feature-001: id is duplicated",
  ]);
});

test("기능 ledger는 런타임이 읽는 feature별 backend contract catalog도 생성한다", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "reference-feature-ledger-"));
  const source = path.join(directory, "inventory.md");
  const output = path.join(directory, "ledger.json");
  const contractsOutput = path.join(directory, "reference_feature_catalog.json");
  try {
    await writeFile(
      source,
      [
        "## API",
        "| Method·path | 요청 |",
        "|---|---|",
        "| `SSE /events/stream` | 없음 |",
      ].join("\n"),
    );
    await writeFeatureLedger({
      source,
      output,
      contractsOutput,
      sourceRevision: REVISION,
    });

    const catalog = JSON.parse(await readFile(contractsOutput, "utf8"));
    assert.deepEqual(catalog, {
      schemaVersion: 1,
      sourceRevision: REVISION,
      featureCount: 1,
      features: [
        {
          contractId: "reference.feature.001",
          id: "reference-feature-001",
          section: "API",
          endpoints: ["SSE /events/stream"],
          streaming: true,
          backendContract: "packages.contracts.parity",
          frontendContract: "frontend/src/shared/parity/referenceParity.ts",
        },
      ],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertFeatureDeliveryComplete,
  parseReferenceInventory,
  validateFeatureLedger,
  writeFeatureLedger,
} from "./reference-feature-ledger.mjs";

const REVISION = "cf643dfee93a5ae8dfcd3c2a982620b793b2b4cc";

const PORT_MAP = {
  schemaVersion: 1,
  sections: {
    "전역 셸": {
      area: "global-shell",
      deliveryStatus: "in_progress",
      backendContract: "domains.catalog",
      frontendContract: "frontend/src/app",
      desktopContract: "desktop",
      verification: ["tests/test_feature_contract_router.py"],
    },
    API: {
      area: "global-shell",
      deliveryStatus: "in_progress",
      backendContract: "domains.catalog",
      frontendContract: "frontend/src/app",
      desktopContract: "desktop",
      verification: ["tests/test_feature_contract_router.py"],
    },
  },
};

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
    PORT_MAP,
  );

  assert.deepEqual(
    ledger.features.map(({
      id,
      contractId,
      section,
      endpoints,
      streaming,
      area,
      deliveryStatus,
      backendContract,
      frontendContract,
      desktopContract,
    }) => ({
      id,
      contractId,
      section,
      endpoints,
      streaming,
      area,
      deliveryStatus,
      backendContract,
      frontendContract,
      desktopContract,
    })),
    [
      {
        id: "reference-feature-001",
        contractId: "reference.feature.001",
        section: "전역 셸",
        endpoints: [],
        streaming: false,
        area: "global-shell",
        deliveryStatus: "in_progress",
        backendContract: "domains.catalog",
        frontendContract: "frontend/src/app",
        desktopContract: "desktop",
      },
      {
        id: "reference-feature-002",
        contractId: "reference.feature.002",
        section: "API",
        endpoints: ["GET /resources"],
        streaming: false,
        area: "global-shell",
        deliveryStatus: "in_progress",
        backendContract: "domains.catalog",
        frontendContract: "frontend/src/app",
        desktopContract: "desktop",
      },
      {
        id: "reference-feature-003",
        contractId: "reference.feature.003",
        section: "API",
        endpoints: ["SSE /events/stream", "WS /pods/{name}/exec"],
        streaming: true,
        area: "global-shell",
        deliveryStatus: "in_progress",
        backendContract: "domains.catalog",
        frontendContract: "frontend/src/app",
        desktopContract: "desktop",
      },
    ],
  );
  assert.deepEqual(validateFeatureLedger(ledger), []);
});

test("기능 ledger는 섹션별 단일 제품 경계에서 행별 이식 상태를 생성한다", () => {
  const ledger = parseReferenceInventory(
    [
      "## 전역 셸",
      "| 영역 | 동작 |",
      "|---|---|",
      "| 명령 팔레트 | 단축키 |",
    ].join("\n"),
    REVISION,
    PORT_MAP,
  );

  assert.deepEqual(ledger.features[0], {
    id: "reference-feature-001",
    contractId: "reference.feature.001",
    section: "전역 셸",
    line: 4,
    cells: ["명령 팔레트", "단축키"],
    endpoints: [],
    streaming: false,
    area: "global-shell",
    deliveryStatus: "in_progress",
    backendContract: "domains.catalog",
    frontendContract: "frontend/src/app",
    desktopContract: "desktop",
    verification: ["tests/test_feature_contract_router.py"],
    coverage: {
      backend: null,
      frontend: null,
      desktop: null,
      realtime: "not_required",
    },
  });
});

test("기능 ledger는 이식 경계가 지정되지 않은 원본 섹션을 거부한다", () => {
  assert.throws(
    () =>
      parseReferenceInventory(
        [
          "## 누락된 섹션",
          "| 영역 | 동작 |",
          "|---|---|",
          "| 명령 팔레트 | 단축키 |",
        ].join("\n"),
        REVISION,
        PORT_MAP,
      ),
    /이식 경계가 없습니다: 누락된 섹션/,
  );
});

test("출하 게이트는 진행 중인 제품 기능을 완료로 처리하지 않는다", () => {
  const ledger = parseReferenceInventory(
    [
      "## 전역 셸",
      "| 영역 | 동작 |",
      "|---|---|",
      "| 명령 팔레트 | 단축키 |",
    ].join("\n"),
    REVISION,
    PORT_MAP,
  );

  assert.throws(
    () => assertFeatureDeliveryComplete(ledger),
    /reference.feature.001: in_progress/,
  );
});

test("출하 게이트는 구현 상태여도 행별 backend/frontend 증거 없이는 통과시키지 않는다", () => {
  const ledger = parseReferenceInventory(
    [
      "## 전역 셸",
      "| 영역 | 동작 |",
      "|---|---|",
      "| 명령 팔레트 | 단축키 |",
    ].join("\n"),
    REVISION,
    {
      ...PORT_MAP,
      sections: {
        ...PORT_MAP.sections,
        "전역 셸": {
          ...PORT_MAP.sections["전역 셸"],
          deliveryStatus: "implemented",
        },
      },
    },
  );

  assert.deepEqual(ledger.features[0].coverage, {
    backend: null,
    frontend: null,
    desktop: null,
    realtime: "not_required",
  });
  assert.throws(
    () => assertFeatureDeliveryComplete(ledger),
    /reference.feature.001: missing backend coverage/,
  );
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
        area: "api",
        deliveryStatus: "implemented",
        backendContract: "",
        frontendContract: "",
        desktopContract: null,
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
        area: "api",
        deliveryStatus: "implemented",
        backendContract: "packages.contracts.parity",
        frontendContract: "frontend/src/shared/parity/referenceParity.ts",
        desktopContract: null,
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
      portMap: {
        schemaVersion: 1,
        sections: {
          API: {
            area: "events",
            deliveryStatus: "in_progress",
            backendContract: "packages.runtime.operation_events",
            frontendContract: "frontend/src/shared/streaming",
            desktopContract: null,
            verification: ["tests/test_operation_event_hub.py"],
          },
        },
      },
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
          area: "events",
          deliveryStatus: "in_progress",
          backendContract: "packages.runtime.operation_events",
          frontendContract: "frontend/src/shared/streaming",
          desktopContract: null,
          verification: ["tests/test_operation_event_hub.py"],
        },
      ],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

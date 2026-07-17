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
const PREVIOUS_REVISION = "3ff2b1095151c690bf536e8e6ca685c2703fcd70";

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
      releasePhase,
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
      releasePhase,
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
        releasePhase: "baseline",
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
        releasePhase: "baseline",
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
        releasePhase: "baseline",
        deliveryStatus: "in_progress",
        backendContract: "domains.catalog",
        frontendContract: "frontend/src/app",
        desktopContract: "desktop",
      },
    ],
  );
  assert.deepEqual(validateFeatureLedger(ledger), []);
});

test("경로 접미사의 fetch progress stream도 실시간 계약으로 분류한다", () => {
  const ledger = parseReferenceInventory(
    [
      "## API",
      "| Method·path | 요청 |",
      "|---|---|",
      "| `POST /helm/releases/install-stream` | fetch stream의 `data:` progress frame |",
    ].join("\n"),
    REVISION,
    PORT_MAP,
  );

  assert.equal(ledger.features[0].streaming, true);
  assert.equal(ledger.features[0].coverage.realtime, null);
});

test("동기 원본 endpoint를 durable OperationEvent로 이식한 행은 port map 실시간 증거를 따른다", () => {
  const ledger = parseReferenceInventory(
    [
      "## API",
      "| Method·path | 요청 |",
      "|---|---|",
      "| `POST /nodes/{name}/drain` | 장시간 요청 |",
    ].join("\n"),
    REVISION,
    {
      ...PORT_MAP,
      features: {
        "reference.feature.001": {
          streaming: true,
          coverage: {
            backend: { state: "implemented" },
            frontend: { state: "implemented" },
            realtime: {
              state: "implemented",
              destination: "frontend/src/features/operations/OperationStatusStore.tsx",
              consumer: "frontend/src/api/operation-events.ts",
              test: "frontend/src/features/operations/OperationStatusStore.test.ts",
            },
          },
        },
      },
    },
    {
      "reference.feature.001":
        "upstream-ui:resources:actions:capability-command-and-log-composition:v1",
    },
  );

  assert.equal(ledger.features[0].streaming, true);
  assert.equal(ledger.features[0].coverage.realtime.state, "implemented");
  assert.equal(ledger.features[0].identityStatus, "source-key");
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
    sourceKey: null,
    legacyContractIds: ["reference.feature.001"],
    identityStatus: "legacy-unmapped",
    section: "전역 셸",
    line: 4,
    cells: ["명령 팔레트", "단축키"],
    endpoints: [],
    streaming: false,
    area: "global-shell",
    releasePhase: "baseline",
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

test("순번 contractId는 legacy alias로만 보존하고 sourceKey가 제공될 때만 authoritative identity를 기록한다", () => {
  const ledger = parseReferenceInventory(
    [
      "## 전역 셸",
      "| 영역 | 동작 |",
      "|---|---|",
      "| 명령 팔레트 | 단축키 |",
    ].join("\n"),
    REVISION,
    PORT_MAP,
    {
      "reference.feature.001": "upstream-ui:shell:command-palette:open:v1",
    },
  );

  assert.deepEqual(
    {
      contractId: ledger.features[0].contractId,
      sourceKey: ledger.features[0].sourceKey,
      legacyContractIds: ledger.features[0].legacyContractIds,
      identityStatus: ledger.features[0].identityStatus,
    },
    {
      contractId: "reference.feature.001",
      sourceKey: "upstream-ui:shell:command-palette:open:v1",
      legacyContractIds: ["reference.feature.001"],
      identityStatus: "source-key",
    },
  );
});

test("sourceKey가 없는 기존 행은 완료 증거가 아니라 legacy-unmapped 상태로 남는다", () => {
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

  assert.deepEqual(
    {
      sourceKey: ledger.features[0].sourceKey,
      legacyContractIds: ledger.features[0].legacyContractIds,
      identityStatus: ledger.features[0].identityStatus,
    },
    {
      sourceKey: null,
      legacyContractIds: ["reference.feature.001"],
      identityStatus: "legacy-unmapped",
    },
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
    {
      "reference.feature.001": "upstream-ui:shell:command-palette:open:v1",
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
    /reference.feature.001: incomplete backend coverage/,
  );
});

test("행별 증거 override가 있는 구현 기능만 출하 게이트를 통과한다", () => {
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
      features: {
        "reference.feature.001": {
          deliveryStatus: "implemented",
          coverage: {
            backend: {
              state: "implemented",
              route: "/api/feature-contracts",
              handler: "domains.parity.router.list_feature_contracts",
              test: "tests/test_feature_contract_router.py",
            },
            frontend: {
              state: "implemented",
              consumer: "frontend/src/shared/parity/referenceParity.ts",
              test: "frontend/src/shared/parity/referenceParity.test.ts",
            },
            desktop: {
              state: "implemented",
              bridge: "desktop",
              test: "desktop/tests/catalog.rs",
            },
          },
        },
      },
      sections: {
        ...PORT_MAP.sections,
        "전역 셸": {
          ...PORT_MAP.sections["전역 셸"],
          deliveryStatus: "implemented",
        },
      },
    },
    {
      "reference.feature.001": "upstream-ui:shell:command-palette:open:v1",
    },
  );

  assert.doesNotThrow(() => assertFeatureDeliveryComplete(ledger));
});

test("웹 출하 게이트는 desktop-only 행과 desktop coverage를 최종 OS 단계로 분리한다", () => {
  const ledger = parseReferenceInventory(
    [
      "## API",
      "| Method·path | 동작 |",
      "|---|---|",
      "| `GET /settings` | 웹 설정 |",
      "| `POST /desktop/save-file` | 네이티브 저장 |",
    ].join("\n"),
    REVISION,
    {
      ...PORT_MAP,
      features: {
        "reference.feature.001": {
          coverage: {
            backend: {
              state: "implemented",
              destination: "src/domains/settings/router.py",
              test: "tests/test_settings.py",
            },
            frontend: {
              state: "implemented",
              destination: "frontend/src/pages/settings/SettingsPage.tsx",
              test: "frontend/src/pages/settings/SettingsPage.test.tsx",
            },
            desktop: {
              state: "blocked",
              destination: "desktop/src-tauri/src/lib.rs",
              reason: "OS packaging is deferred to the final desktop release.",
            },
          },
        },
      },
    },
    {
      "reference.feature.001": "upstream-ui:settings:user-preferences:read:v1",
    },
  );

  assert.throws(() => assertFeatureDeliveryComplete(ledger), /reference.feature.001: in_progress/);
  assert.doesNotThrow(() => assertFeatureDeliveryComplete(ledger, { surface: "web" }));
  assert.throws(
    () => assertFeatureDeliveryComplete(ledger, { surface: "mobile" }),
    /지원하지 않는 release surface/,
  );
});

test("baseline 웹 출하 게이트는 명시적 post-parity 기능을 제외하고 최종 제품 게이트는 계속 추적한다", () => {
  const ledger = parseReferenceInventory(
    [
      "## 전역 셸",
      "| 영역 | 동작 |",
      "|---|---|",
      "| 명령 팔레트 | 기준 동등성 |",
      "## RCA",
      "| 영역 | 동작 |",
      "|---|---|",
      "| 원인 분석 | 기준 동등성 이후 확장 |",
    ].join("\n"),
    REVISION,
    {
      schemaVersion: 1,
      sections: {
        "전역 셸": {
          area: "global-shell",
          deliveryStatus: "implemented",
          backendContract: "domains.catalog",
          frontendContract: "frontend/src/app",
          desktopContract: null,
          verification: ["scripts/reference-feature-ledger.test.mjs"],
          coverage: {
            backend: { state: "implemented" },
            frontend: { state: "implemented" },
          },
        },
        RCA: {
          area: "rca-extension",
          releasePhase: "post_parity",
          deliveryStatus: "planned",
          backendContract: "domains.rca",
          frontendContract: "frontend/src/features/rca",
          desktopContract: null,
          verification: ["scripts/reference-feature-ledger.test.mjs"],
        },
      },
    },
    {
      "reference.feature.001": "upstream-ui:shell:command-palette:open:v1",
    },
  );

  assert.deepEqual(
    ledger.features.map((feature) => feature.releasePhase),
    ["baseline", "post_parity"],
  );
  assert.doesNotThrow(() =>
    assertFeatureDeliveryComplete(ledger, { surface: "web", phase: "baseline" }));
  assert.throws(
    () => assertFeatureDeliveryComplete(ledger, { surface: "web" }),
    /reference.feature.002: incomplete backend coverage/,
  );
  assert.throws(
    () => assertFeatureDeliveryComplete(ledger, { surface: "web", phase: "post_parity" }),
    /reference.feature.002: incomplete backend coverage/,
  );
  assert.throws(
    () => assertFeatureDeliveryComplete(ledger, { surface: "web", phase: "phase-three" }),
    /지원하지 않는 release phase/,
  );
});

test("feature ledger는 누락된 source identity·계약과 중복 ID를 거부한다", () => {
  const errors = validateFeatureLedger({
    schemaVersion: 1,
    sourceRevision: REVISION,
    featureCount: 2,
    features: [
      {
        id: "reference-feature-001",
        contractId: "reference.feature.001",
        sourceKey: null,
        legacyContractIds: ["reference.feature.001"],
        identityStatus: "legacy-unmapped",
        section: "API",
        line: 1,
        cells: ["`GET /health`"],
        endpoints: ["GET /health"],
        streaming: false,
        area: "api",
        releasePhase: "baseline",
        deliveryStatus: "implemented",
        backendContract: "",
        frontendContract: "",
        desktopContract: null,
        verification: [],
        coverage: {
          backend: null,
          frontend: null,
          desktop: null,
          realtime: "not_required",
        },
      },
      {
        id: "reference-feature-001",
        contractId: "reference.feature.002",
        sourceKey: null,
        legacyContractIds: ["reference.feature.002"],
        identityStatus: "legacy-unmapped",
        section: "API",
        line: 2,
        cells: ["`GET /readyz`"],
        endpoints: ["GET /readyz"],
        streaming: false,
        area: "api",
        releasePhase: "baseline",
        deliveryStatus: "implemented",
        backendContract: "packages.contracts.parity",
        frontendContract: "frontend/src/shared/parity/referenceParity.ts",
        desktopContract: null,
        verification: ["scripts/reference-feature-ledger.test.mjs"],
        coverage: {
          backend: null,
          frontend: null,
          desktop: null,
          realtime: "not_required",
        },
      },
    ],
  });

  assert.deepEqual(errors, [
    "reference-feature-001: implemented source identity is required",
    "reference-feature-001: backendContract is required",
    "reference-feature-001: frontendContract is required",
    "reference-feature-001: at least one verification target is required",
    "reference-feature-001: implemented source identity is required",
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
          sourceKey: null,
          legacyContractIds: ["reference.feature.001"],
          identityStatus: "legacy-unmapped",
          id: "reference-feature-001",
          section: "API",
          endpoints: ["SSE /events/stream"],
          streaming: true,
          area: "events",
          releasePhase: "baseline",
          deliveryStatus: "in_progress",
          backendContract: "packages.runtime.operation_events",
          frontendContract: "frontend/src/shared/streaming",
          desktopContract: null,
          verification: ["tests/test_operation_event_hub.py"],
          coverage: {
            backend: null,
            frontend: null,
            desktop: null,
            realtime: null,
          },
        },
      ],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("strict release는 sourceKey alias manifest가 target revision과 다르면 완전한 기능도 거부한다", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "reference-feature-alias-revision-"));
  const source = path.join(directory, "inventory.md");
  const output = path.join(directory, "ledger.json");
  const contractsOutput = path.join(directory, "reference_feature_catalog.json");
  const aliases = path.join(directory, "source-key-aliases.json");
  try {
    await writeFile(
      source,
      [
        "## API",
        "| Method·path | 요청 |",
        "|---|---|",
        "| `GET /resources` | 없음 |",
      ].join("\n"),
    );
    await writeFile(
      aliases,
      JSON.stringify({
        schemaVersion: 1,
        sourceRevision: PREVIOUS_REVISION,
        aliases: {
          "reference.feature.001": "upstream-ui:resources:list:read:v1",
        },
      }),
    );

    await assert.rejects(
      () =>
        writeFeatureLedger({
          source,
          output,
          contractsOutput,
          sourceKeyAliases: aliases,
          sourceRevision: REVISION,
          requireComplete: true,
          portMap: {
            schemaVersion: 1,
            sections: {
              API: {
                area: "resources",
                deliveryStatus: "implemented",
                backendContract: "domains.resources.router",
                frontendContract: "frontend/src/pages/resources",
                desktopContract: null,
                verification: ["scripts/reference-feature-ledger.test.mjs"],
                coverage: {
                  backend: { route: "/api/resources", test: "tests/test_resources.py" },
                  frontend: { consumer: "ResourcesPage", test: "ResourcesPage.test.tsx" },
                },
              },
            },
          },
        }),
      /sourceKey alias manifest revision .* does not match target/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("웹 클러스터 범위는 권한 계약과 원본 identity를 연결하고 저장소 홍보 동작은 제외한다", async () => {
  const [portMap, aliases, classifications, ledger] = await Promise.all([
    readRepositoryJson("../docs/migration/reference-feature-port-map.json"),
    readRepositoryJson("../docs/migration/reference-feature-source-aliases.json"),
    readRepositoryJson("../docs/migration/reference-ui-delta-classifications.json"),
    readRepositoryJson("../docs/migration/reference-feature-ledger.json"),
  ]);
  const sourceKey = "upstream-ui:shell:context-switcher:server-scope:v1";
  const contextInteraction = classifications
    .classifications["web/src/components/ContextSwitcher.tsx"]
    .interactions.find((interaction) => interaction.sourceKey === sourceKey);

  for (const contractId of ["reference.feature.099", "reference.feature.101"]) {
    const port = portMap.features[contractId];
    const feature = ledger.features.find((candidate) => candidate.contractId === contractId);
    assert.equal(port.deliveryStatus, "implemented");
    assert.equal(port.desktopContract, null);
    assert.equal(port.coverage.backend.state, "implemented");
    assert.equal(port.coverage.frontend.state, "implemented");
    assert.equal(aliases.aliases[contractId], sourceKey);
    assert.equal(feature.deliveryStatus, "implemented");
    assert.equal(feature.sourceKey, sourceKey);
  }
  assert.deepEqual(contextInteraction.legacyContractIds, [
    "reference.feature.099",
    "reference.feature.101",
  ]);

  for (const contractId of ["reference.feature.107", "reference.feature.108"]) {
    const port = portMap.features[contractId];
    const feature = ledger.features.find((candidate) => candidate.contractId === contractId);
    assert.equal(port.deliveryStatus, "not_applicable");
    assert.equal(port.desktopContract, null);
    assert.equal(port.coverage.backend.state, "not_required");
    assert.equal(port.coverage.frontend.state, "not_required");
    assert.equal(feature.deliveryStatus, "not_applicable");
  }
});

test("Applications 경로와 투영은 URL·Python 계약·갱신 증거를 연결한다", async () => {
  const [portMap, aliases, classifications, ledger] = await Promise.all([
    readRepositoryJson("../docs/migration/reference-feature-port-map.json"),
    readRepositoryJson("../docs/migration/reference-feature-source-aliases.json"),
    readRepositoryJson("../docs/migration/reference-ui-delta-classifications.json"),
    readRepositoryJson("../docs/migration/reference-feature-ledger.json"),
  ]);
  const expected = new Map([
    ["reference.feature.026", "upstream-ui:applications:route:url-scope-and-history:v1"],
    ["reference.feature.117", "upstream-ui:applications:projection:catalog-detail-refresh:v1"],
  ]);
  const interactions = classifications
    .classifications["web/src/components/applications/ApplicationsView.tsx"]
    .interactions;

  for (const [contractId, sourceKey] of expected) {
    const port = portMap.features[contractId];
    const feature = ledger.features.find((candidate) => candidate.contractId === contractId);
    const interaction = interactions.find((candidate) => candidate.sourceKey === sourceKey);
    assert.equal(port.deliveryStatus, "implemented");
    assert.equal(port.desktopContract, null);
    assert.equal(port.coverage.backend.state, "implemented");
    assert.equal(port.coverage.frontend.state, "implemented");
    assert.equal(aliases.aliases[contractId], sourceKey);
    assert.equal(feature.deliveryStatus, "implemented");
    assert.equal(feature.sourceKey, sourceKey);
    assert.ok(interaction.legacyContractIds.includes(contractId));
  }
});

test("주요 REST 갱신 정책은 서버 계약과 화면별 소비 상태를 행별로 기록한다", async () => {
  const [portMap, aliases, classifications, ledger] = await Promise.all([
    readRepositoryJson("../docs/migration/reference-feature-port-map.json"),
    readRepositoryJson("../docs/migration/reference-feature-source-aliases.json"),
    readRepositoryJson("../docs/migration/reference-ui-delta-classifications.json"),
    readRepositoryJson("../docs/migration/reference-feature-ledger.json"),
  ]);
  const expected = new Map([
    ["reference.feature.066", ["upstream-ui:home:dashboard-api:sectioned-projection:v1", "implemented"]],
    ["reference.feature.067", ["upstream-ui:issues:queue:verified-severity-order:v1", "implemented"]],
    ["reference.feature.068", ["upstream-ui:applications:projection:catalog-detail-refresh:v1", "implemented"]],
    ["reference.feature.069", ["upstream-ui:resources:view:guarded-count-and-query-identity:v1", "implemented"]],
    ["reference.feature.071", ["upstream-ui:resources:metrics-grid:canonical-range-and-separation:v1", "implemented"]],
    ["reference.feature.072", ["upstream-ui:resources:metrics-grid:canonical-range-and-separation:v1", "implemented"]],
    ["reference.feature.073", ["upstream-ui:gitops:fleet:authorized-catalog:v1", "implemented"]],
    ["reference.feature.074", ["upstream-ui:gitops:fleet:authorized-catalog:v1", "implemented"]],
    ["reference.feature.075", ["upstream-ui:helm:release-list:scope-rbac:v1", "implemented"]],
    ["reference.feature.076", ["upstream-ui:cost:overview:availability-scope:v1", "implemented"]],
    ["reference.feature.077", ["upstream-ui:service-access:port-session:list-and-layout:v1", "implemented"]],
  ]);
  const interactions = Object.values(classifications.classifications)
    .flatMap((classification) => classification.interactions ?? []);

  assert.equal(portMap.sections["6.2 주요 REST 갱신 주기"].deliveryStatus, "implemented");
  for (const [contractId, [sourceKey, deliveryStatus]] of expected) {
    const port = portMap.features[contractId];
    const feature = ledger.features.find((candidate) => candidate.contractId === contractId);
    const interaction = interactions.find((candidate) => candidate.sourceKey === sourceKey);
    assert.equal(port.deliveryStatus, deliveryStatus);
    assert.equal(port.coverage.backend.state, "implemented");
    assert.equal(aliases.aliases[contractId], sourceKey);
    assert.equal(feature.deliveryStatus, deliveryStatus);
    assert.equal(feature.sourceKey, sourceKey);
    assert.ok(interaction.legacyContractIds.includes(contractId));
    if (deliveryStatus === "implemented") {
      assert.equal(port.coverage.frontend.state, "implemented");
    }
  }

  const home = portMap.features["reference.feature.066"];
  assert.equal(home.coverage.realtime.state, "implemented");
  assert.equal(
    home.backendContract,
    "packages.contracts.freshness.HomeDashboardEventFrame",
  );
  assert.equal(
    portMap.features["reference.feature.069"].coverage.realtime.state,
    "implemented",
  );

  const changes = portMap.features["reference.feature.070"];
  const changesFeature = ledger.features.find(
    (candidate) => candidate.contractId === "reference.feature.070",
  );
  assert.equal(changes.deliveryStatus, "implemented");
  assert.equal(changes.coverage.backend.state, "implemented");
  assert.equal(changes.coverage.frontend.state, "implemented");
  assert.equal(changes.coverage.realtime.state, "implemented");
  assert.ok(changes.verification.includes("tests/test_change_timeline_router.py"));
  assert.equal(changes.verification.includes("tests/test_changes_router.py"), false);
  assert.equal(changesFeature.deliveryStatus, "implemented");
  assert.equal(
    aliases.aliases["reference.feature.070"],
    "upstream-ui:timeline:delta-sync:epoch-resync-test:v1",
  );

  assert.equal(portMap.features["reference.feature.075"].coverage.frontend.state, "implemented");
  assert.equal(portMap.features["reference.feature.076"].coverage.frontend.state, "implemented");
  assert.equal(portMap.features["reference.feature.077"].coverage.desktop.state, "implemented");
});

test("포트 전달 UI registry와 전역 표시는 native listener 전까지 fail-closed 상태를 공유한다", async () => {
  const [portMap, aliases, classifications, ledger] = await Promise.all([
    readRepositoryJson("../docs/migration/reference-feature-port-map.json"),
    readRepositoryJson("../docs/migration/reference-feature-source-aliases.json"),
    readRepositoryJson("../docs/migration/reference-ui-delta-classifications.json"),
    readRepositoryJson("../docs/migration/reference-feature-ledger.json"),
  ]);
  const expected = new Map([
    ["reference.feature.160", "upstream-ui:service-access:port-session:list-and-layout:v1"],
    ["reference.feature.163", "upstream-ui:service-access:port-session:native-control:v1"],
  ]);
  const interactions = classifications
    .classifications["web/src/components/portforward/PortForwardManager.tsx"]
    .interactions;

  for (const [contractId, sourceKey] of expected) {
    const port = portMap.features[contractId];
    const feature = ledger.features.find((candidate) => candidate.contractId === contractId);
    const interaction = interactions.find((candidate) => candidate.sourceKey === sourceKey);
    assert.equal(port.deliveryStatus, "in_progress");
    assert.equal(port.coverage.frontend.state, "blocked");
    assert.equal(port.coverage.desktop.state, "blocked");
    assert.equal(aliases.aliases[contractId], sourceKey);
    assert.equal(feature.deliveryStatus, "in_progress");
    assert.equal(feature.sourceKey, sourceKey);
    assert.equal(interaction.opsiaPort.state, "in_progress");
    assert.equal(interaction.opsiaPort.blockedReason, null);
  }

  assert.equal(portMap.features["reference.feature.162"].deliveryStatus, "in_progress");
  assert.equal(portMap.features["reference.feature.162"].coverage.backend.state, "implemented");
  assert.equal(portMap.features["reference.feature.162"].coverage.realtime.state, "implemented");
  assert.equal(portMap.features["reference.feature.162"].coverage.frontend.state, "blocked");
  assert.equal(portMap.features["reference.feature.162"].coverage.desktop.state, "blocked");
});

test("공유 React Helm 조회 화면은 별도 desktop bridge 계약을 요구하지 않는다", async () => {
  const [portMap, ledger] = await Promise.all([
    readRepositoryJson("../docs/migration/reference-feature-port-map.json"),
    readRepositoryJson("../docs/migration/reference-feature-ledger.json"),
  ]);

  for (const contractId of ["reference.feature.183", "reference.feature.184"]) {
    const port = portMap.features[contractId];
    const feature = ledger.features.find((candidate) => candidate.contractId === contractId);
    assert.equal(port.deliveryStatus, "implemented", contractId);
    assert.equal(port.desktopContract, null, contractId);
    assert.equal(feature.desktopContract, null, contractId);
  }
});

test("리소스 YAML 편집은 Safe PR와 직접 operation 적용을 함께 보존한다", async () => {
  const [portMap, aliases, classifications, ledger] = await Promise.all([
    readRepositoryJson("../docs/migration/reference-feature-port-map.json"),
    readRepositoryJson("../docs/migration/reference-feature-source-aliases.json"),
    readRepositoryJson("../docs/migration/reference-ui-delta-classifications.json"),
    readRepositoryJson("../docs/migration/reference-feature-ledger.json"),
  ]);
  const contractId = "reference.feature.165";
  const sourceKey = "upstream-ui:api:resource-manifest:direct-apply:v1";
  const port = portMap.features[contractId];
  const feature = ledger.features.find((candidate) => candidate.contractId === contractId);
  const interaction = classifications.classifications["web/src/api/client.ts"].interactions
    .find((candidate) => candidate.sourceKey === sourceKey);

  assert.equal(port.deliveryStatus, "implemented");
  assert.equal(port.coverage.backend.state, "implemented");
  assert.equal(port.coverage.frontend.state, "implemented");
  assert.equal(aliases.aliases[contractId], sourceKey);
  assert.equal(feature.deliveryStatus, "implemented");
  assert.equal(feature.sourceKey, sourceKey);
  assert.ok(interaction.legacyContractIds.includes("reference.feature.164"));
  assert.ok(interaction.legacyContractIds.includes(contractId));
  assert.equal(interaction.opsiaPort.state, "in_progress");
  assert.equal(interaction.opsiaPort.blockedReason, null);
});

test("Helm 업그레이드는 서버 값 검증과 공용 operation stream 증거로 완결한다", async () => {
  const [portMap, aliases, classifications, ledger] = await Promise.all([
    readRepositoryJson("../docs/migration/reference-feature-port-map.json"),
    readRepositoryJson("../docs/migration/reference-feature-source-aliases.json"),
    readRepositoryJson("../docs/migration/reference-ui-delta-classifications.json"),
    readRepositoryJson("../docs/migration/reference-feature-ledger.json"),
  ]);
  const contractId = "reference.feature.201";
  const sourceKey = "upstream-ui:helm:upgrade-client:values-payload:v1";
  const port = portMap.features[contractId];
  const feature = ledger.features.find((candidate) => candidate.contractId === contractId);
  const interaction = classifications.classifications["web/src/api/client.ts"].interactions
    .find((candidate) => candidate.sourceKey === sourceKey);

  assert.equal(port.deliveryStatus, "implemented");
  assert.equal(port.coverage.backend.state, "implemented");
  assert.equal(port.coverage.frontend.state, "implemented");
  assert.equal(port.coverage.realtime.state, "implemented");
  assert.equal(
    port.coverage.realtime.consumer,
    "frontend/src/features/operations/OperationStatusStore.tsx",
  );
  assert.equal(aliases.aliases[contractId], sourceKey);
  assert.equal(feature.deliveryStatus, "implemented");
  assert.equal(feature.sourceKey, sourceKey);
  assert.equal(interaction.opsiaPort.state, "in_progress");
  assert.equal(interaction.opsiaPort.blockedReason, null);
});

test("PVC 상세는 실제 범위 메트릭과 관측 완전성 증거로 완결한다", async () => {
  const [portMap, aliases, classifications, ledger] = await Promise.all([
    readRepositoryJson("../docs/migration/reference-feature-port-map.json"),
    readRepositoryJson("../docs/migration/reference-feature-source-aliases.json"),
    readRepositoryJson("../docs/migration/reference-ui-delta-classifications.json"),
    readRepositoryJson("../docs/migration/reference-feature-ledger.json"),
  ]);
  const contractId = "reference.feature.153";
  const sourceKey = "upstream-ui:resources:metrics-grid:network-filesystem-and-saturation:v1";
  const port = portMap.features[contractId];
  const feature = ledger.features.find((candidate) => candidate.contractId === contractId);
  const interactions = Object.values(classifications.classifications)
    .flatMap((classification) => classification.interactions ?? []);
  const interaction = interactions.find((candidate) => candidate.sourceKey === sourceKey);

  assert.equal(port.deliveryStatus, "implemented");
  assert.equal(port.coverage.backend.state, "implemented");
  assert.equal(port.coverage.frontend.state, "implemented");
  assert.equal(aliases.aliases[contractId], sourceKey);
  assert.equal(feature.deliveryStatus, "implemented");
  assert.equal(feature.sourceKey, sourceKey);
  assert.ok(interaction.legacyContractIds.includes(contractId));
  assert.equal(interaction.opsiaPort.state, "in_progress");
  assert.equal(interaction.opsiaPort.blockedReason, null);
});

test("전역 셸·라우트·키보드·실시간 bootstrap은 기존 제품 계약 증거로 승격한다", async () => {
  const [portMap, aliases, classifications, ledger] = await Promise.all([
    readRepositoryJson("../docs/migration/reference-feature-port-map.json"),
    readRepositoryJson("../docs/migration/reference-feature-source-aliases.json"),
    readRepositoryJson("../docs/migration/reference-ui-delta-classifications.json"),
    readRepositoryJson("../docs/migration/reference-feature-ledger.json"),
  ]);
  const expected = new Map([
    ["reference.feature.014", "upstream-ui:app-shell:layout-and-overlays:descriptor-state:v1"],
    ...[
      "021", "022", "023", "024", "027", "028", "029",
      "030", "031", "032", "033", "034", "035", "036",
    ].map((id) => [
      `reference.feature.${id}`,
      "upstream-ui:app-shell:canonical-navigation:detail-and-cost:v1",
    ]),
    ...["043", "044", "045", "046", "047", "048", "049", "050", "053", "054", "057"].map((id) => [
      `reference.feature.${id}`,
      "upstream-ui:app-shell:keyboard:single-authority:v1",
    ]),
    ["reference.feature.058", "upstream-ui:topology:stream:connecting-lifecycle:v1"],
    ["reference.feature.059", "upstream-ui:timeline:delta-sync:epoch-resync-test:v1"],
    ["reference.feature.060", "upstream-ui:topology:stream:connecting-lifecycle:v1"],
    ["reference.feature.064", "upstream-ui:shell:connection-state:authorized-refresh:v1"],
  ]);
  const interactionOwners = new Map();
  for (const [path, classification] of Object.entries(classifications.classifications)) {
    for (const interaction of classification.interactions ?? []) {
      for (const contractId of interaction.legacyContractIds ?? []) {
        interactionOwners.set(contractId, { path, sourceKey: interaction.sourceKey });
      }
    }
  }

  for (const [contractId, sourceKey] of expected) {
    const port = portMap.features[contractId];
    const feature = ledger.features.find((candidate) => candidate.contractId === contractId);
    assert.equal(port.deliveryStatus, "implemented", contractId);
    assert.equal(port.desktopContract, null, contractId);
    assert.ok(["implemented", "not_required"].includes(port.coverage.backend.state), contractId);
    assert.equal(port.coverage.frontend.state, "implemented", contractId);
    assert.equal(aliases.aliases[contractId], sourceKey, contractId);
    assert.equal(feature.deliveryStatus, "implemented", contractId);
    assert.equal(feature.sourceKey, sourceKey, contractId);
    assert.equal(interactionOwners.get(contractId)?.sourceKey, sourceKey, contractId);
  }

  for (const contractId of ["reference.feature.025", "reference.feature.052"]) {
    const port = portMap.features[contractId];
    const feature = ledger.features.find((candidate) => candidate.contractId === contractId);
    assert.equal(port.deliveryStatus, "not_applicable", contractId);
    assert.equal(port.desktopContract, null, contractId);
    assert.equal(port.coverage.backend.state, "not_required", contractId);
    assert.equal(port.coverage.frontend.state, "not_required", contractId);
    assert.equal(feature.deliveryStatus, "not_applicable", contractId);
  }
});

test("Helm 리비전 비교는 URL 재개와 Python artifact 증거로 완결한다", async () => {
  const [portMap, aliases, classifications, ledger] = await Promise.all([
    readRepositoryJson("../docs/migration/reference-feature-port-map.json"),
    readRepositoryJson("../docs/migration/reference-feature-source-aliases.json"),
    readRepositoryJson("../docs/migration/reference-ui-delta-classifications.json"),
    readRepositoryJson("../docs/migration/reference-feature-ledger.json"),
  ]);
  const contractId = "reference.feature.188";
  const sourceKey = "upstream-ui:helm:revision-compare:shared-diff:v1";
  const port = portMap.features[contractId];
  const feature = ledger.features.find((candidate) => candidate.contractId === contractId);
  const interaction = classifications
    .classifications["web/src/components/helm/HelmCompareRoute.tsx"]
    .interactions.find((candidate) => candidate.sourceKey === sourceKey);

  assert.equal(aliases.aliases[contractId], sourceKey);
  assert.equal(port.deliveryStatus, "implemented");
  assert.equal(port.backendContract, "packages.contracts.helm.artifacts");
  assert.equal(port.coverage.backend.state, "implemented");
  assert.equal(port.coverage.frontend.state, "implemented");
  assert.ok(port.verification.includes("frontend/src/features/filters/helmArtifactUrlState.test.ts"));
  assert.equal(feature.deliveryStatus, "implemented");
  assert.equal(feature.sourceKey, sourceKey);
  assert.equal(interaction.opsiaPort.state, "in_progress");
  assert.equal(interaction.opsiaPort.blockedReason, null);
  assert.ok(interaction.opsiaPort.destinations.includes(
    "src/services/target/cluster-agent/commands/helm.py",
  ));
});

test("노드 비용은 실제 관측·권한 범위와 가격 부재를 단일 계약으로 완결한다", async () => {
  const [portMap, aliases, classifications, ledger] = await Promise.all([
    readRepositoryJson("../docs/migration/reference-feature-port-map.json"),
    readRepositoryJson("../docs/migration/reference-feature-source-aliases.json"),
    readRepositoryJson("../docs/migration/reference-ui-delta-classifications.json"),
    readRepositoryJson("../docs/migration/reference-feature-ledger.json"),
  ]);
  const contractId = "reference.feature.220";
  const sourceKey = "upstream-ui:cost:nodes-client:provider-identity:v1";
  const port = portMap.features[contractId];
  const feature = ledger.features.find((candidate) => candidate.contractId === contractId);
  const interaction = classifications.classifications["web/src/api/client.ts"].interactions
    .find((candidate) => candidate.sourceKey === sourceKey);

  assert.equal(aliases.aliases[contractId], sourceKey);
  assert.equal(port.deliveryStatus, "implemented");
  assert.equal(port.coverage.backend.state, "implemented");
  assert.equal(port.coverage.frontend.state, "implemented");
  assert.ok(port.verification.includes("tests/test_cost_node_projection.py"));
  assert.ok(port.verification.includes("frontend/src/api/cost-nodes.test.ts"));
  assert.equal(feature.deliveryStatus, "implemented");
  assert.equal(feature.sourceKey, sourceKey);
  assert.equal(interaction.opsiaPort.state, "in_progress");
  assert.equal(interaction.opsiaPort.blockedReason, null);
  assert.ok(interaction.opsiaPort.destinations.includes("src/domains/cost/router.py"));
  assert.ok(interaction.opsiaPort.destinations.includes(
    "frontend/src/pages/cost/CostNodesPanel.tsx",
  ));
});

test("설정 권한과 호스트 설정 delta는 분리된 권한 주체와 명시적 차단 사유를 연결한다", async () => {
  const [portMap, aliases, classifications, ledger] = await Promise.all([
    readRepositoryJson("../docs/migration/reference-feature-port-map.json"),
    readRepositoryJson("../docs/migration/reference-feature-source-aliases.json"),
    readRepositoryJson("../docs/migration/reference-ui-delta-classifications.json"),
    readRepositoryJson("../docs/migration/reference-feature-ledger.json"),
  ]);
  const permissions = classifications
    .classifications["web/src/components/settings/MyPermissionsDialog.tsx"];
  const permissionsInteraction = permissions.interactions.find(
    (candidate) => candidate.sourceKey === aliases.aliases["reference.feature.134"],
  );
  const settings = classifications
    .classifications["web/src/components/settings/SettingsDialog.tsx"];

  assert.equal(permissions.classification, "classified");
  assert.equal(settings.classification, "classified");
  assert.equal(
    aliases.aliases["reference.feature.134"],
    "upstream-ui:settings:permissions:kubernetes-subject-rules:v1",
  );
  assert.equal(
    aliases.aliases["reference.feature.124"],
    "upstream-ui:settings:permissions:restricted-resource-visibility:v1",
  );
  assert.equal(
    aliases.aliases["reference.feature.221"],
    "upstream-ui:settings:host-config:startup-replacement:v1",
  );
  assert.equal(
    aliases.aliases["reference.feature.222"],
    "upstream-ui:settings:host-config:startup-replacement:v1",
  );
  assert.equal(
    aliases.aliases["reference.feature.223"],
    "upstream-ui:settings:prometheus:live-apply:v1",
  );
  assert.equal(portMap.features["reference.feature.134"].deliveryStatus, "implemented");
  assert.equal(portMap.features["reference.feature.134"].coverage.backend.state, "implemented");
  assert.equal(portMap.features["reference.feature.134"].coverage.frontend.state, "implemented");
  assert.ok(
    portMap.features["reference.feature.134"].verification.includes(
      "tests/test_resource_access_projection.py",
    ),
  );
  assert.equal(
    portMap.features["reference.feature.134"].coverage.backend.destination,
    "src/domains/shell_state/router.py#get_settings_access",
  );
  assert.equal(
    portMap.features["reference.feature.134"].coverage.frontend.destination,
    "frontend/src/pages/settings/SettingsPage.tsx#AccessPanel",
  );
  for (const contractId of [
    "reference.feature.124",
    "reference.feature.221",
    "reference.feature.222",
  ]) {
    const feature = ledger.features.find((candidate) => candidate.contractId === contractId);
    assert.equal(feature.sourceKey, aliases.aliases[contractId]);
    assert.notEqual(feature.deliveryStatus, "implemented");
  }
  const permissionsFeature = ledger.features.find(
    (candidate) => candidate.contractId === "reference.feature.134",
  );
  assert.equal(permissionsFeature.deliveryStatus, "implemented");
  assert.equal(permissionsInteraction.opsiaPort.state, "in_progress");
  assert.equal(permissionsInteraction.opsiaPort.blockedReason, null);
  assert.match(permissionsInteraction.opsiaPort.rationale, /cluster-agent ServiceAccount/);
  const prometheusFeature = ledger.features.find(
    (candidate) => candidate.contractId === "reference.feature.223",
  );
  assert.equal(prometheusFeature.sourceKey, aliases.aliases["reference.feature.223"]);
  assert.equal(prometheusFeature.deliveryStatus, "implemented");
  assert.equal(
    portMap.features["reference.feature.223"].coverage.backend.destination,
    "src/domains/integrations/prometheus.py#update_prometheus_integration",
  );
  assert.equal(
    portMap.features["reference.feature.223"].coverage.frontend.destination,
    "frontend/src/pages/settings/PrometheusIntegrationCard.tsx#PrometheusIntegrationCard",
  );
  assert.equal(
    settings.interactions.find((interaction) =>
      interaction.sourceKey === "upstream-ui:settings:host-config:startup-replacement:v1"
    ).opsiaPort.state,
    "blocked",
  );
});

async function readRepositoryJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8"));
}

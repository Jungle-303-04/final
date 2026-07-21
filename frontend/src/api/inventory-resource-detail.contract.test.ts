import { describe, expect, it, vi } from "vitest";

import { getInventoryResourceDetail } from "./inventory";

// P0-C 계약 고정: `GET /inventory/resource-detail` 200 응답이 partial/nullable 여도
// raw invalid-payload 로 떨어지지 않고 정직 상태로 파싱됨을 실 백엔드 형태로 못박는다.
//
// 기존 inventory.test.ts 는 detail 안에서 access=null·unavailable 과 discriminator
// 거부만 덮는다. 그러나 실 백엔드(demo-server Pod live)는 access.type="subject" 를
// 반환하며 role/namespace 변형도 계약에 존재한다. 이 파일은 detail 문맥에서 subject·
// role·namespace 변형과 non-null provider_detail·nullable 리소스 필드를 고정해,
// 4-변형 discriminated union 이 detail 경로에서 회귀하면 즉시 실패하게 한다.

// 2026-07-22 demo-server/Pod cluster-agent 실 200 응답에서 관측한 필드 그대로.
const LIVE_POD_RESOURCE = {
  inventory_key: "b16c8bdc348d3e62cefee6ee8e28172412d510803f6ceb67ae976f7855174d13",
  snapshot_id: "9ca66db2-955e-4dd4-9d23-2dc3acc19c1a",
  workspace_id: "default",
  cluster_id: "demo-server",
  resource_type: "pod",
  api_version: "v1",
  kind: "Pod",
  namespace: "target",
  name: "cluster-agent-5446d9f768-t48mz",
  uid: "aee2465c-4404-45c4-9527-43cb3e6d7416",
  resource_version: "591702",
  status: "Running",
  health: "healthy",
  labels: { app: "cluster-agent", "pod-template-hash": "5446d9f768" },
  annotations: {},
  summary: { uid: "aee2465c-4404-45c4-9527-43cb3e6d7416", name: "cluster-agent", phase: "Running" },
  observed_at: "2026-07-22T07:35:00Z",
  first_seen_at: "2026-07-22T06:00:00Z",
  last_seen_at: "2026-07-22T07:35:00Z",
  deleted_at: null,
  created_at: "2026-07-22T06:00:00Z",
  updated_at: "2026-07-22T07:35:00Z",
};

const IDENTITY = {
  resource_type: "pod",
  kind: "Pod",
  namespace: "target",
  name: "cluster-agent-5446d9f768-t48mz",
};

const ROLE_REF = { kind: "Role" as const, namespace: "target", name: "cluster-agent" };
const BINDING_REF = { kind: "RoleBinding" as const, namespace: "target", name: "cluster-agent", role: ROLE_REF };
const POLICY_RULE = {
  verbs: ["get", "list", "watch"],
  api_groups: [""],
  resources: ["pods"],
  resource_names: [],
  non_resource_urls: [],
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function detailWith(overrides: Record<string, unknown>) {
  return {
    cluster_id: "demo-server",
    identity: IDENTITY,
    resource: LIVE_POD_RESOURCE,
    provider_detail: null,
    access: null,
    related: {},
    events: [],
    ...overrides,
  };
}

const request = () => getInventoryResourceDetail("demo-server", {
  resourceType: "pod",
  kind: "Pod",
  name: "cluster-agent-5446d9f768-t48mz",
  namespace: "target",
});

describe("inventory resource-detail contract (real backend shapes)", () => {
  it("parses the live subject access variant with nested bindings, rules and pods", async () => {
    // 실 demo-server Pod 이 반환하는 형태: access.type="subject".
    const payload = detailWith({
      access: {
        type: "subject",
        observed_at: "2026-07-22T07:35:00Z",
        subject: { kind: "ServiceAccount", namespace: "target", name: "cluster-agent" },
        direct: [{ binding: BINDING_REF, role: ROLE_REF, rules: [POLICY_RULE], scope_namespace: "target" }],
        inherited_from_groups: [{ group_name: "system:serviceaccounts", bindings: [] }],
        flat: [POLICY_RULE],
        truncated: false,
        used_by_pods: [{ namespace: "target", name: "cluster-agent-5446d9f768-t48mz" }],
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));
    await expect(request()).resolves.toMatchObject({ access: { type: "subject" } });
  });

  it("parses the role access variant embedded in a resource detail", async () => {
    const payload = detailWith({
      access: {
        type: "role",
        observed_at: "2026-07-22T07:35:00Z",
        role: ROLE_REF,
        bindings: [{ binding: BINDING_REF, subjects: [{ kind: "ServiceAccount", namespace: "target", name: "cluster-agent" }] }],
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));
    await expect(request()).resolves.toMatchObject({ access: { type: "role" } });
  });

  it("parses the namespace access variant embedded in a resource detail", async () => {
    const payload = detailWith({
      access: {
        type: "namespace",
        observed_at: "2026-07-22T07:35:00Z",
        namespace: "target",
        role_bindings: [{ binding: BINDING_REF, subjects: [] }],
        cluster_role_bindings_with_local_subject: [],
        service_account_count: 3,
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));
    await expect(request()).resolves.toMatchObject({ access: { type: "namespace" } });
  });

  it("accepts a non-null provider_detail whose discriminator is a real enum type", async () => {
    // provider_detail 은 서버 discriminator + catchall 중첩 projection 을 통과해야 한다.
    const payload = detailWith({
      provider_detail: {
        type: "persistent-volume-claim",
        phase: "Bound",
        capacity: { storage: "8Gi" },
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));
    await expect(request()).resolves.toMatchObject({ provider_detail: { type: "persistent-volume-claim" } });
  });

  it("keeps a partial/nullable resource as an honest observed state, never invalid-payload", async () => {
    // 관측 안 됨 필드는 null 로 온다 — fabrication 금지. null 이어도 정상 파싱되어야 한다.
    const payload = detailWith({
      resource: {
        ...LIVE_POD_RESOURCE,
        uid: null,
        resource_version: null,
        namespace: null,
        observed_at: null,
        first_seen_at: null,
        last_seen_at: null,
        created_at: null,
        updated_at: null,
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));
    const detail = await request();
    expect(detail.resource.uid).toBeNull();
    expect(detail.resource.namespace).toBeNull();
    expect(detail.resource.observed_at).toBeNull();
  });

  it("parses a detail carrying related resources and full-fidelity events", async () => {
    const payload = detailWith({
      related: { owner: [{ ...LIVE_POD_RESOURCE, kind: "ReplicaSet", resource_type: "replicaset", name: "cluster-agent-5446d9f768" }] },
      events: [{ ...LIVE_POD_RESOURCE, kind: "Event", resource_type: "event", name: "cluster-agent.evt-1", health: "info", status: "Normal" }],
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));
    const detail = await request();
    expect(detail.related.owner).toHaveLength(1);
    expect(detail.events).toHaveLength(1);
  });
});

// P0-C 재조준(dev 98725cc48): 70ca5ecb0 은 inventory.test.ts 에서 provider_detail
// 생략 정규화 + invented discriminator 거부를 이미 덮는다(중복 금지). 여기서는 그 커밋이
// 덮지 않은 경계만 보강한다: access-only·both 생략, exact 실 partial 200(둘 다 unobserved),
// 그리고 "존재하지만 malformed" payload 의 계속된 거부를 accept 경계와 함께 고정한다.
function detailOmitting(...keys: string[]) {
  const full: Record<string, unknown> = {
    cluster_id: "demo-server",
    identity: IDENTITY,
    resource: LIVE_POD_RESOURCE,
    provider_detail: null,
    access: null,
    related: {},
    events: [],
  };
  for (const k of keys) delete full[k];
  return full;
}

// demo-server Service dev-demo-api 실 200 에서 관측: provider_detail·access 모두 null,
// resource 는 deleted_at 만 null(그 외 관측됨). RBAC 미관측 = access null(정직 상태).
const LIVE_SERVICE_PARTIAL = {
  cluster_id: "demo-server",
  identity: { resource_type: "service", kind: "Service", namespace: "yaml-demo", name: "dev-demo-api" },
  resource: {
    ...LIVE_POD_RESOURCE,
    resource_type: "service",
    kind: "Service",
    namespace: "yaml-demo",
    name: "dev-demo-api",
    deleted_at: null,
  },
  provider_detail: null,
  access: null,
  related: {},
  events: [],
};

describe("inventory resource-detail contract (partial/omission/rejection boundary)", () => {
  it("parses an exact real partial 200 where both projections are unobserved (null)", async () => {
    // 실 Service 200: provider_detail·access 둘 다 null → raw invalid-payload 아님, 정직 관측.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(LIVE_SERVICE_PARTIAL));
    const detail = await request();
    expect(detail.provider_detail).toBeNull();
    expect(detail.access).toBeNull();
    expect(detail.resource.deleted_at).toBeNull();
  });

  it("normalizes an access-only omission to null (sequential-deploy old gateway)", async () => {
    // 70ca5ecb0 은 provider_detail 생략만 덮음 — access 단독 생략을 여기서 고정.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(detailOmitting("access")));
    await expect(request()).resolves.toMatchObject({ access: null, provider_detail: null });
  });

  it("normalizes a both-projection omission to null without invalid-payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(detailOmitting("provider_detail", "access")));
    const detail = await request();
    expect(detail.provider_detail).toBeNull();
    expect(detail.access).toBeNull();
  });

  it("still rejects a present-but-malformed access variant missing a required field", async () => {
    // 존재하는 discriminator 라도 필수 필드 누락은 관용하지 않는다(가짜 관측 방지).
    const payload = detailWith({ access: { type: "subject" /* observed_at·subject 등 누락 */ } });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));
    await expect(request()).rejects.toMatchObject({ kind: "invalid-payload" });
  });

  it("still rejects a present provider_detail that omits its discriminator", async () => {
    const payload = detailWith({ provider_detail: { instance_id: "i-123" /* type 누락 */ } });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));
    await expect(request()).rejects.toMatchObject({ kind: "invalid-payload" });
  });

  it("still rejects a genuinely malformed resource (wrong-typed required field)", async () => {
    const payload = detailWith({ resource: { ...LIVE_POD_RESOURCE, name: 123 } });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));
    await expect(request()).rejects.toMatchObject({ kind: "invalid-payload" });
  });
});

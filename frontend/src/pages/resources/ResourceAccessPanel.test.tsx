// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { I18nProvider } from "../../shared/i18n";
import { ResourceAccessPanel } from "./ResourceAccessPanel";

describe("ResourceAccessPanel", () => {
  it("renders exact ServiceAccount grants, inherited groups, and Pod usage", () => {
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <ResourceAccessPanel
          access={{
            type: "subject",
            observedAt: "2026-07-17T00:00:00Z",
            subject: { kind: "ServiceAccount", namespace: "shop", name: "checkout" },
            direct: [{
              binding: { kind: "RoleBinding", namespace: "shop", name: "reader", role: { kind: "Role", namespace: "shop", name: "reader" } },
              role: { kind: "Role", namespace: "shop", name: "reader" },
              rules: [{ verbs: ["get", "list"], apiGroups: [""], resources: ["pods"], resourceNames: [], nonResourceUrls: [] }],
              scopeNamespace: "shop",
            }],
            inheritedFromGroups: [{ groupName: "system:authenticated", bindings: [] }],
            flat: [{ verbs: ["watch"], apiGroups: ["apps"], resources: ["deployments"], resourceNames: [], nonResourceUrls: [] }],
            truncated: false,
            usedByPods: [{ namespace: "shop", name: "checkout-7d9" }],
          }}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("Kubernetes access")).toBeTruthy();
    expect(screen.getByText("RoleBinding/shop/reader")).toBeTruthy();
    expect(screen.getByText("Role/shop/reader")).toBeTruthy();
    expect(screen.getByText("core/pods")).toBeTruthy();
    expect(screen.getByText("Effective rules")).toBeTruthy();
    expect(screen.getByText("apps/deployments")).toBeTruthy();
    expect(screen.getByText("system:authenticated")).toBeTruthy();
    expect(screen.getByText("shop/checkout-7d9")).toBeTruthy();
  });
});

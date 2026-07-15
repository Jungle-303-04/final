// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { HomeClusterProvider } from "../home/homeContract";
import { I18nProvider } from "../../shared/i18n";
import { ClusterProviderIcon } from "./ClusterProviderIcon";

afterEach(cleanup);

describe("ClusterProviderIcon", () => {
  it.each([
    ["eks", "Amazon Elastic Kubernetes Service"],
    ["gke", "Google Kubernetes Engine"],
    ["aks", "Microsoft Azure Kubernetes Service"],
    ["onprem", "On-premises Kubernetes"],
    ["kind", "Kubernetes in Docker"],
    ["unknown", "Unknown Kubernetes provider"],
  ] satisfies ReadonlyArray<readonly [HomeClusterProvider, string]>) (
    "renders verified %s metadata through one provider component",
    (provider, label) => {
      render(
        <I18nProvider navigatorLanguage="en-US" storage={null}>
          <ClusterProviderIcon provider={provider} />
        </I18nProvider>,
      );

      const icon = screen.getByRole("img", { name: label });
      expect(icon.getAttribute("data-provider")).toBe(provider);
      expect(icon.getAttribute("title")).toBe(label);
    },
  );

  it("uses a neutral server glyph when provider metadata is unknown", () => {
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <ClusterProviderIcon provider="unknown" />
      </I18nProvider>,
    );

    const icon = screen.getByRole("img", { name: "Unknown Kubernetes provider" });
    expect(icon.querySelector(".lucide-server")).not.toBeNull();
    expect(icon.querySelector(".lucide-boxes")).toBeNull();
  });
});

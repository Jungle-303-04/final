// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import azureLogo from "./azure.svg";
import gcpLogo from "./gcp.png";
import { ProviderLogo } from "./ProviderLogo";

describe("ProviderLogo", () => {
  it("renders light and dark AWS assets without duplicating accessible content", () => {
    const { container } = render(<ProviderLogo className="size-6" provider="eks" />);

    expect(container.querySelectorAll("img")).toHaveLength(2);
    expect(container.querySelector("[aria-hidden='true']")?.className).toContain("size-6");
    expect(container.querySelectorAll("img[alt='']")).toHaveLength(2);
  });

  it("uses the provider asset for Azure and Google", () => {
    const { container, rerender } = render(<ProviderLogo provider="aks" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(azureLogo);

    rerender(<ProviderLogo provider="gke" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(gcpLogo);
  });
});

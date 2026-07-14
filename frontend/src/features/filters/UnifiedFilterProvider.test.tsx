// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import {
  FilterProbe,
  readState,
  renderProvider,
} from "./__tests__/UnifiedFilterProviderTestSupport";

afterEach(cleanup);

describe("UnifiedFilterProvider", () => {
  it("is passive on mount and keeps legacy or unresolved values URL-authoritative", () => {
    renderProvider(
      "/resources?cluster=unknown%2Fcluster&labels=team%3Dcheckout" +
      "&resource=shop%2Fapi&kind=Pod",
      true,
    );

    expect(readState()).toMatchObject({
      clusters: ["unknown/cluster"],
      detail: { resource: "shop/api", resourceKind: "Pod" },
      labels: ["team=checkout"],
      location: "/resources?cluster=unknown%2Fcluster&labels=team%3Dcheckout" +
        "&resource=shop%2Fapi&kind=Pod",
      navigationType: "POP",
      needsCanonicalWrite: true,
    });
  });

  it("canonicalizes only on explicit request with replace and preserves detail identity", async () => {
    const user = userEvent.setup();
    renderProvider(
      "/resources?cluster=cluster-a&resource=shop%2Fapi&kind=Pod" +
      "&tab=events&full=1&node=worker-a",
    );

    await user.click(screen.getByRole("button", { name: "canonicalize" }));

    expect(readState()).toMatchObject({
      location: "/resources?clusters=cluster-a&resource=shop%2Fapi" +
        "&resourceKind=Pod&tab=events&full=true&node=worker-a",
      navigationType: "REPLACE",
      needsCanonicalWrite: false,
    });
  });

  it("uses push for chips, replace for typing, preserves detail, and skips no-op writes", async () => {
    const user = userEvent.setup();
    renderProvider(
      "/resources?clusters=cluster-a&resource=shop%2Fapi&resourceKind=Pod#panel",
    );

    await user.click(screen.getByRole("button", { name: "add label" }));
    expect(readState()).toMatchObject({
      labels: ["team=checkout"],
      location: "/resources?clusters=cluster-a&labels=team%3Dcheckout" +
        "&resource=shop%2Fapi&resourceKind=Pod#panel",
      navigationType: "PUSH",
    });

    await user.click(screen.getByRole("button", { name: "type query" }));
    expect(readState()).toMatchObject({
      location: "/resources?clusters=cluster-a&labels=team%3Dcheckout" +
        "&resources.q=checkout&resource=shop%2Fapi&resourceKind=Pod#panel",
      navigationType: "REPLACE",
    });

    await user.click(screen.getByRole("button", { name: "same filters" }));
    expect(readState().navigationType).toBe("REPLACE");
  });

  it("does not lose a change when an updater mutates the current object in place", async () => {
    const user = userEvent.setup();
    renderProvider("/resources?clusters=cluster-a");

    await user.click(screen.getByRole("button", { name: "mutate query" }));

    expect(readState()).toMatchObject({
      location: "/resources?clusters=cluster-a&resources.q=mutated",
      navigationType: "REPLACE",
    });
  });

  it("derives state from browser history and never overwrites a pop navigation", async () => {
    const user = userEvent.setup();
    renderProvider("/resources?clusters=cluster-a");

    await user.click(screen.getByRole("button", { name: "add label" }));
    await user.click(screen.getByRole("button", { name: "add cluster" }));
    expect(readState()).toMatchObject({
      clusters: ["cluster-a", "cluster-b"],
      labels: ["team=checkout"],
    });

    await user.click(screen.getByRole("button", { name: "back" }));
    expect(readState()).toMatchObject({
      clusters: ["cluster-a"],
      labels: ["team=checkout"],
      navigationType: "POP",
    });

    await user.click(screen.getByRole("button", { name: "forward" }));
    expect(readState()).toMatchObject({
      clusters: ["cluster-a", "cluster-b"],
      navigationType: "POP",
    });
  });

  it("builds cross-surface hrefs with filters but without detail or unknown query", () => {
    renderProvider(
      "/resources?clusters=cluster-a&labels=team%3Dcheckout" +
      "&resources.types=Pod&issues.status=open&resource=shop%2Fapi" +
      "&resourceKind=Pod&tab=events&full=true&node=worker-a&debug=1",
    );

    expect(screen.getByTestId("issues-href").textContent).toBe(
      "/issues?clusters=cluster-a&labels=team%3Dcheckout" +
      "&resources.types=Pod&issues.status=open",
    );
  });

  it("updates detail through the URL authority without changing any filter axis", async () => {
    const user = userEvent.setup();
    renderProvider(
      "/resources?clusters=cluster-a&namespaces=cluster-a%2Fshop" +
      "&applications=app-a&labels=team%3Dcheckout&resources.types=pod" +
      "&resources.health=warning&resources.q=api#results",
    );

    await user.click(screen.getByRole("button", { name: "open detail" }));
    expect(readState()).toMatchObject({
      location: "/resources?clusters=cluster-a&namespaces=cluster-a%2Fshop" +
        "&applications=app-a&labels=team%3Dcheckout&resources.types=pod" +
        "&resources.health=warning&resources.q=api&resource=shop%2Fapi" +
        "&resourceKind=Pod#results",
      navigationType: "PUSH",
    });

    await user.click(screen.getByRole("button", { name: "select detail tab" }));
    expect(readState()).toMatchObject({
      location: "/resources?clusters=cluster-a&namespaces=cluster-a%2Fshop" +
        "&applications=app-a&labels=team%3Dcheckout&resources.types=pod" +
        "&resources.health=warning&resources.q=api&resource=shop%2Fapi" +
        "&resourceKind=Pod&tab=events#results",
      navigationType: "REPLACE",
    });

    await user.click(screen.getByRole("button", { name: "close detail" }));
    expect(readState()).toMatchObject({
      location: "/resources?clusters=cluster-a&namespaces=cluster-a%2Fshop" +
        "&applications=app-a&labels=team%3Dcheckout&resources.types=pod" +
        "&resources.health=warning&resources.q=api#results",
      navigationType: "REPLACE",
    });
  });

  it("updates Home drill-in without deleting filters", async () => {
    const user = userEvent.setup();
    renderProvider(
      "/home?clusters=cluster-a&labels=team%3Dcheckout&issues.status=open",
    );

    await user.click(screen.getByRole("button", { name: "select node" }));

    expect(readState()).toMatchObject({
      location: "/home?clusters=cluster-a&labels=team%3Dcheckout" +
        "&issues.status=open&node=worker-a",
      navigationType: "PUSH",
    });
  });

  it("serializes same-task filter and detail mutations without losing either update", async () => {
    const user = userEvent.setup();
    renderProvider("/resources?clusters=cluster-a&resources.types=pod");

    await user.click(screen.getByRole("button", { name: "filter and open detail" }));

    expect(readState()).toMatchObject({
      labels: ["team=checkout"],
      location: "/resources?clusters=cluster-a&labels=team%3Dcheckout" +
        "&resources.types=pod&resource=shop%2Fapi&resourceKind=Pod",
    });
  });

  it("dual-reads a legacy Resources path into navigation and the first write", async () => {
    const user = userEvent.setup();
    renderProvider("/resources/pod?clusters=cluster-a");

    expect(readState().resourceTypes).toEqual(["pod"]);
    expect(screen.getByTestId("issues-href").textContent).toBe(
      "/issues?clusters=cluster-a&resources.types=pod",
    );

    await user.click(screen.getByRole("button", { name: "add label" }));
    expect(readState().location).toBe(
      "/resources/pod?clusters=cluster-a&labels=team%3Dcheckout&resources.types=pod",
    );
  });

  it("fails loudly when the hook is used outside its provider", () => {
    expect(() => render(
      <MemoryRouter><FilterProbe /></MemoryRouter>,
    )).toThrow("useUnifiedFilter must be used within UnifiedFilterProvider");
  });
});

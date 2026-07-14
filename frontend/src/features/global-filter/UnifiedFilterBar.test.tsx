// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
} from "react-router-dom";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { I18nProvider } from "../../shared/i18n";
import { UnifiedFilterProvider } from "../filters/UnifiedFilterProvider";
import type {
  GlobalFilterPort,
  GlobalFilterSuggestion,
} from "./globalFilterContract";
import { UnifiedFilterBar } from "./UnifiedFilterBar";

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);
afterAll(() => vi.unstubAllGlobals());

describe("UnifiedFilterBar", () => {
  it("renders server-defined groups and writes typed selections to the canonical URL", async () => {
    const user = userEvent.setup();
    const search = vi.fn<GlobalFilterPort["search"]>(async (query) =>
      query === "" ? structuralSuggestions : searchableSuggestions,
    );
    renderFilter({ search });

    await user.click(screen.getByRole("button", { name: filterPlaceholder }));
    await waitFor(() =>
      expect(search).toHaveBeenCalledWith(
        "",
        emptySelection,
        expect.any(AbortSignal),
      ),
    );
    expect(screen.getByText("Clusters")).toBeTruthy();
    expect(screen.getByText("Namespaces")).toBeTruthy();
    expect(screen.getByText("Applications")).toBeTruthy();
    expect(screen.getByText("Types")).toBeTruthy();
    expect(screen.queryByText("Labels")).toBeNull();
    expect(screen.getByText("at least 4")).toBeTruthy();
    expect(screen.getByText("unknown")).toBeTruthy();

    const input = screen.getByRole("textbox", { name: filterPlaceholder });
    await user.type(input, "check");
    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith(
        "check",
        emptySelection,
        expect.any(AbortSignal),
      ),
    );
    expect(
      screen.getByText("Same type: OR · different types: AND · labels: AND"),
    ).toBeTruthy();
    await user.click(screen.getByText("Checkout"));
    await waitFor(() =>
      expect(screen.getByTestId("filter-location").textContent).toBe(
        "/resources?applications=checkout",
      ),
    );
    expect(
      screen.getByRole("button", {
        name: "Remove Applications filter checkout",
      }),
    ).toBeTruthy();

    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith(
        "",
        { ...emptySelection, applications: ["checkout"] },
        expect.any(AbortSignal),
      ),
    );
    await user.type(input, "team");
    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith(
        "team",
        { ...emptySelection, applications: ["checkout"] },
        expect.any(AbortSignal),
      ),
    );
    await user.click(screen.getByText("team=platform"));
    await waitFor(() =>
      expect(screen.getByTestId("filter-location").textContent).toBe(
        "/resources?applications=checkout&labels=team%3Dplatform",
      ),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Remove Applications filter checkout",
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("filter-location").textContent).toBe(
        "/resources?labels=team%3Dplatform",
      ),
    );
  });

  it("turns a server-provided resource type into a removable type chip", async () => {
    const user = userEvent.setup();
    renderFilter({ search: vi.fn(async () => structuralSuggestions) });

    await user.click(screen.getByRole("button", { name: filterPlaceholder }));
    await user.click(await screen.findByText("Pod"));

    await waitFor(() =>
      expect(screen.getByTestId("filter-location").textContent).toBe(
        "/resources?resources.types=pod",
      ),
    );
    await user.click(screen.getByRole("button", { name: "Remove Types filter Pod" }));
    await waitFor(() =>
      expect(screen.getByTestId("filter-location").textContent).toBe("/resources"),
    );
  });

  it("keeps chips inside one fixed search border and removes the last chip with backspace", async () => {
    const user = userEvent.setup();
    renderFilter(
      { search: vi.fn(async () => structuralSuggestions) },
      "/resources?applications=checkout&resources.types=pod",
    );

    const control = document.querySelector<HTMLElement>('[data-slot="search-pill-input"]');
    expect(control?.className).toContain("h-9");
    expect(control?.className).toContain("border");
    expect(control?.className).toContain("overflow-x-auto");
    expect(control?.className).not.toContain("flex-wrap");
    expect(within(control!).getByText("checkout")).toBeTruthy();
    expect(within(control!).getByText("Pod")).toBeTruthy();

    const input = within(control!).getByRole("textbox", { name: filterPlaceholder });
    await user.click(input);
    await user.keyboard("{Backspace}");

    await waitFor(() =>
      expect(screen.getByTestId("filter-location").textContent).toBe(
        "/resources?applications=checkout",
      ),
    );
    expect((input as HTMLInputElement).value).toBe("");
    expect(within(control!).queryByText("Pod")).toBeNull();
  });

  it("clears every canonical chip from the same search control", async () => {
    const user = userEvent.setup();
    renderFilter(
      { search: vi.fn(async () => structuralSuggestions) },
      "/resources?clusters=cluster-a&applications=checkout&labels=team%3Dplatform",
    );

    const control = document.querySelector<HTMLElement>('[data-slot="search-pill-input"]')!;
    await user.click(within(control).getByRole("button", { name: "Clear all filters" }));

    await waitFor(() =>
      expect(screen.getByTestId("filter-location").textContent).toBe("/resources"),
    );
    expect(within(control).queryByText("cluster-a")).toBeNull();
    expect(within(control).queryByText("checkout")).toBeNull();
    expect(within(control).queryByText("team=platform")).toBeNull();
  });

  it("aborts superseded requests and never paints a stale response", async () => {
    const user = userEvent.setup();
    const first = deferred<readonly GlobalFilterSuggestion[]>();
    const current = deferred<readonly GlobalFilterSuggestion[]>();
    const signals: AbortSignal[] = [];
    const search = vi.fn<GlobalFilterPort["search"]>(
      (query, _selection, signal) => {
        signals.push(signal!);
        return query === "" ? first.promise : current.promise;
      },
    );
    renderFilter({ search });

    await user.click(screen.getByRole("button", { name: filterPlaceholder }));
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    await user.type(
      screen.getByRole("textbox", { name: filterPlaceholder }),
      "fresh",
    );
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
    expect(signals[0].aborted).toBe(true);

    current.resolve([searchableSuggestions[0]]);
    expect(await screen.findByText("Checkout")).toBeTruthy();
    first.resolve([
      {
        type: "resource",
        id: "stale",
        label: "stale-result",
        kind: "Pod",
        count: 1,
        count_completeness: "exact",
      },
    ]);
    await Promise.resolve();
    expect(screen.queryByText("stale-result")).toBeNull();
  });
});

const filterPlaceholder = "Filter clusters, apps, labels, and resources";
const emptySelection = {
  clusters: [],
  namespaces: [],
  applications: [],
  resourceTypes: [],
  labels: [],
};
const structuralSuggestions = [
  counted({ type: "cluster", id: "cluster-a", label: "Production", count: 8 }),
  counted({
    type: "namespace",
    id: "cluster-a/shop",
    label: "shop",
    clusterId: "cluster-a",
    count: 4,
    count_completeness: "partial",
  }),
  counted({
    type: "application",
    id: "catalog",
    label: "Catalog",
    count: null,
    count_completeness: "unavailable",
  }),
  counted({ type: "resourceType", id: "pod", label: "Pod", count: 12 }),
] satisfies GlobalFilterSuggestion[];
const searchableSuggestions = [
  counted({ type: "application", id: "checkout", label: "Checkout", count: 3 }),
  counted({
    type: "label",
    id: "team=platform",
    label: "team=platform",
    key: "team",
    value: "platform",
    count: 2,
  }),
  counted({
    type: "resource",
    id: "deployment:checkout",
    label: "checkout-api",
    kind: "Deployment",
    count: 1,
  }),
] satisfies GlobalFilterSuggestion[];

function counted<T extends Omit<GlobalFilterSuggestion, "count_completeness">>(
  item: T & {
    count_completeness?: GlobalFilterSuggestion["count_completeness"];
  },
): GlobalFilterSuggestion {
  return { count_completeness: "exact", ...item } as GlobalFilterSuggestion;
}

function renderFilter(port: GlobalFilterPort, initialEntry = "/resources") {
  const router = createMemoryRouter(
    [
      {
        path: "/resources",
        element: (
          <I18nProvider navigatorLanguage="en-US" storage={null}>
            <UnifiedFilterProvider>
              <UnifiedFilterBar port={port} />
              <LocationProbe />
            </UnifiedFilterProvider>
          </I18nProvider>
        ),
      },
    ],
    { initialEntries: [initialEntry] },
  );
  return render(<RouterProvider router={router} />);
}

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="filter-location">
      {location.pathname}
      {location.search}
    </output>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
}

class TestResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

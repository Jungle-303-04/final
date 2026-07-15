// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PRODUCT_LOCALE_STORAGE_KEY } from "./shared/i18n/locale";
import ProductApp from "./ProductApp";
import { homeApiResponse, requestCount } from "./ProductApp.testSupport";

beforeEach(() => {
  vi.useRealTimers();
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  document.documentElement.className = "";
  document.documentElement.removeAttribute("lang");
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  vi.useRealTimers();
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
});

describe("ProductApp root recovery", () => {
  it("owns locale resolution at the application root", () => {
    const language = vi
      .spyOn(window.navigator, "language", "get")
      .mockReturnValue("ko-KR");
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => undefined));

    const first = render(<ProductApp />);
    expect(document.documentElement.lang).toBe("ko");
    first.unmount();

    window.localStorage.setItem(PRODUCT_LOCALE_STORAGE_KEY, "en");
    language.mockReturnValue("ko-KR");
    render(<ProductApp />);
    expect(document.documentElement.lang).toBe("en");
  });

  it("loads exactly one session in StrictMode and keeps unauthenticated navigation hidden", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "Not authenticated" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    render(
      <StrictMode>
        <ProductApp />
      </StrictMode>,
    );

    expect(
      await screen.findByRole("heading", { name: "Sign in to Opsia" }),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/session",
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.queryByRole("navigation")).toBeNull();
  }, 15_000);

  it("redirects the retired Home route to the real cluster inventory", async () => {
    window.history.replaceState({}, "", "/home?cluster=cluster-1");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const path = typeof input === "string" ? input : input.toString();
        return homeApiResponse(path);
      });

    render(
      <StrictMode>
        <ProductApp />
      </StrictMode>,
    );

    expect(
      await screen.findByRole(
        "heading",
        { name: "Clusters", level: 2 },
        { timeout: 5_000 },
      ),
    ).toBeTruthy();
    expect((await screen.findAllByText("cluster-1")).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Home" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Incidents" })).toBeTruthy();
    expect(requestCount(fetchMock, "/api/auth/session")).toBe(1);
    expect(requestCount(fetchMock, "/api/clusters?limit=100")).toBe(1);
    expect(window.location.pathname).toBe("/clusters");
    expect(requestCount(fetchMock, "/api/clusters/cluster-1/summary")).toBe(0);
    expect(requestCount(fetchMock, "/api/clusters/cluster-1/nodes/summary")).toBe(0);
  }, 15_000);

  it("loads the approved Resources contracts and keeps detail on the same route", async () => {
    window.history.replaceState({}, "", "/resources/pod?cluster=cluster-1");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const path = typeof input === "string" ? input : input.toString();
        return homeApiResponse(path);
      });

    render(
      <StrictMode>
        <ProductApp />
      </StrictMode>,
    );

    expect(
      await screen.findByRole(
        "table",
        { name: "Resource list" },
        { timeout: 5_000 },
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Resources" })
        .getAttribute("aria-current"),
    ).toBe("page");
    const resource = await screen.findByRole(
      "button",
      { name: "Open details for checkout-api-0" },
      { timeout: 5_000 },
    );
    expect(
      requestCount(
        fetchMock,
        "/api/resources?clusters=cluster-1&resources.types=pod&resources.includeDeleted=false&limit=50",
      ),
    ).toBe(1);

    await userEvent.setup().click(resource);
    const dialog = await screen.findByRole(
      "dialog",
      { name: "checkout-api-0 details" },
      { timeout: 5_000 },
    );
    expect(dialog.textContent).toContain("Running");
    expect(window.location.pathname).toBe("/resources/pod");
    expect(new URLSearchParams(window.location.search).get("detail")).toBe(
      "Pod/shop/checkout-api-0",
    );
    expect(new URLSearchParams(window.location.search).get("resource")).toBeNull();
    expect(
      requestCount(
        fetchMock,
        "/api/clusters/cluster-1/inventory/resource-detail?resource_type=pod&kind=Pod&name=checkout-api-0&namespace=shop&related_limit=100&event_limit=50",
      ),
    ).toBe(1);
  }, 15_000);
});

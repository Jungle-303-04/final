// @vitest-environment jsdom

import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { homePort, renderHome } from "./HomePage.testSupport";

afterEach(cleanup);

describe("HomePage unified-filter cutover", () => {
  it("preserves canonical filters while opening and closing a Node detail", async () => {
    const user = userEvent.setup();
    renderHome(homePort(), [
      "/?clusters=cluster-1" +
      "&namespaces=cluster-1%2Fshop" +
      "&applications=checkout" +
      "&labels=team%3Dcheckout" +
      "&node=worker-b",
    ]);

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    });

    expectHomeQuery({ node: "worker-b" });
    expect(screen.getByRole("heading", { name: "worker-b의 Pod" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Node 목록으로" }));

    await waitFor(() => expect(screen.queryByRole("heading", { name: "worker-b의 Pod" }))
      .toBeNull());
    expectHomeQuery({ node: null });
  }, 15_000);
});

function expectHomeQuery({ node }: { node: string | null }) {
  const location = screen.getByTestId("home-location").textContent ?? "";
  const search = new URL(location, "https://product.test").searchParams;
  expect(search.get("clusters")).toBe("cluster-1");
  expect(search.get("namespaces")).toBe("cluster-1/shop");
  expect(search.get("applications")).toBe("checkout");
  expect(search.get("labels")).toBe("team=checkout");
  expect(search.get("node")).toBe(node);
  expect(search.has("cluster")).toBe(false);
}

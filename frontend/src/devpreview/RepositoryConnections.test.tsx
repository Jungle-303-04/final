// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RepositoryConnections } from "./RepositoryConnections";

describe("RepositoryConnections", () => {
  it("shows one repository row and opens its GitOps view", () => {
    const onOpenRepository = vi.fn();

    render(
      <RepositoryConnections
        groups={[
          {
            repositoryRef: "jungle/demo-game",
            applications: [
              { id: "app-1", name: "game", branch: "main", manifestPath: "deploy/game.yaml" },
              { id: "app-2", name: "redis", branch: "main", manifestPath: "deploy/redis.yaml" },
            ],
          },
        ]}
        onOpenRepository={onOpenRepository}
      />,
    );

    expect(screen.getByText("연결됨 · 앱 2개")).toBeTruthy();
    expect(screen.queryByText("deploy/game.yaml")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "jungle/demo-game GitOps 열기" }));
    expect(onOpenRepository).toHaveBeenCalledWith("jungle/demo-game");
  });
});

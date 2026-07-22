import { describe, expect, it } from "vitest";

import type { ApplicationView } from "./deployFeed";
import { groupApplicationsByRepository } from "./repositoryRegistry";

function application(
  id: string,
  name: string,
  repositoryRef: string | null,
  lifecycleStatus = "active",
): ApplicationView {
  return {
    id,
    name,
    repositoryRef,
    defaultBranch: "main",
    manifestPath: `deploy/${name}.yaml`,
    lifecycleStatus,
  } as ApplicationView;
}

describe("groupApplicationsByRepository", () => {
  it("groups active application targets by case-insensitive repository identity", () => {
    const groups = groupApplicationsByRepository([
      application("app-1", "game", "Jungle/demo-game"),
      application("app-2", "redis", "jungle/demo-game"),
      application("app-3", "api", "jungle/final"),
      application("app-4", "old", "jungle/final", "archived"),
      application("app-5", "local", null),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      repositoryRef: "Jungle/demo-game",
      applications: [
        { id: "app-1", name: "game" },
        { id: "app-2", name: "redis" },
      ],
    });
    expect(groups[1]).toMatchObject({
      repositoryRef: "jungle/final",
      applications: [{ id: "app-3", name: "api" }],
    });
  });
});

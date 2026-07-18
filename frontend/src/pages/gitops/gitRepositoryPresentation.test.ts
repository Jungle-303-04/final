import { describe, expect, it } from "vitest";
import {
  detectGitRepositoryProvider,
  isGitRepositoryReference,
} from "./gitRepositoryPresentation";

describe("gitRepositoryPresentation", () => {
  it.each([
    ["https://github.com/opsia/console.git", "github"],
    ["git@gitlab.com:opsia/console.git", "gitlab"],
    ["https://bitbucket.org/opsia/console", "bitbucket"],
    ["team/console", "generic"],
  ] as const)("recognizes %s as %s", (repository, provider) => {
    expect(detectGitRepositoryProvider(repository)).toBe(provider);
    expect(isGitRepositoryReference(repository)).toBe(true);
  });

  it.each(["", "repository", "https://github.com", "team / repository"])(
    "rejects incomplete repository reference %s",
    (repository) => expect(isGitRepositoryReference(repository)).toBe(false),
  );
});

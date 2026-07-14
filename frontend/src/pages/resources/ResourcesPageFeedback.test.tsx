// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import { I18nProvider } from "../../shared/i18n";
import { ResourcesClusterBoundary, UnknownSelection } from "./ResourcesPageFeedback";

afterEach(cleanup);

describe("resources page feedback", () => {
  it("explains a missing cluster with a user action and no implementation language", () => {
    renderFeedback(<UnknownSelection value="missing-cluster" variant="cluster" />);

    expect(screen.getByRole("heading").textContent).toBe("클러스터를 찾을 수 없습니다");
    expect(screen.getByRole("link", { name: /클러스터 보기/u }).getAttribute("href"))
      .toBe("/clusters");
    expect(document.body.textContent).not.toMatch(/API|URL|계약|snapshot/iu);
  });

  it("tells users how to recover from a multiple-cluster selection", () => {
    renderFeedback(<ResourcesClusterBoundary variant="multiple" />);

    expect(screen.getByRole("heading").textContent).toBe("클러스터를 하나만 선택해 주세요");
    expect(document.body.textContent).toContain("선택한 클러스터 하나만 남겨 주세요");
  });
});

function renderFeedback(content: React.ReactNode) {
  return render(
    <I18nProvider navigatorLanguage="ko-KR" storage={null}>
      <MemoryRouter initialEntries={["/resources"]}>
        <UnifiedFilterProvider>{content}</UnifiedFilterProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
}

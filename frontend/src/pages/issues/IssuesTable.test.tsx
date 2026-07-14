// @vitest-environment jsdom

import type { ReactElement, ReactNode } from "react";
import { cleanup, render as renderBase, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IssueSummary } from "../../features/issues/issuesContract";
import { I18nProvider } from "../../shared/i18n";
import { IssuesTable } from "./IssuesTable";

afterEach(cleanup);

const OPENABLE_ISSUE: IssueSummary = {
  id: "issue:workspace-1/correlation-1",
  workspaceId: "workspace-1",
  incidentId: "incident-1",
  correlationId: "correlation-1",
  clusterId: "cluster-1",
  namespace: "payments",
  resourceKind: "Deployment",
  resourceName: "checkout-api",
  symptom: "응답 지연이 증가했습니다",
  currentSubject: "deployment/payments/checkout-api",
  status: "investigating",
  rootCause: null,
  confidence: null,
  supportingEvidence: ["Pod 재시작 증가"],
  missingEvidence: ["최근 배포 이력"],
  evidenceRef: "evidence-1",
  actionRoute: "/unsafe/internal-route",
  commandId: null,
  pullRequestUrl: "https://example.invalid/private",
  errorReason: null,
  updatedAt: "2026-07-13T01:30:00Z",
};

const UNLINKED_ISSUE: IssueSummary = {
  ...OPENABLE_ISSUE,
  id: "issue:workspace-1/correlation-2",
  incidentId: null,
  correlationId: "correlation-2",
  namespace: null,
  resourceKind: "Node",
  resourceName: "worker-a",
  symptom: null,
  status: "waiting-for-evidence",
  updatedAt: null,
};

describe("IssuesTable", () => {
  it("renders the server order, literal status, resource scope, and an accessible caption", () => {
    render(<IssuesTable items={[OPENABLE_ISSUE, UNLINKED_ISSUE]} onOpen={vi.fn()} />);

    expect(screen.getByText("현재 API 응답 범위의 인시던트 목록").className)
      .toContain("sr-only");
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("응답 지연이 증가했습니다")).toBeTruthy();
    expect(within(rows[0]!).getByText("investigating")).toBeTruthy();
    expect(within(rows[0]!).getByText("Deployment · payments/checkout-api")).toBeTruthy();
    expect(within(rows[1]!).getByText("증상 미제공")).toBeTruthy();
    expect(within(rows[1]!).getByText("waiting-for-evidence")).toBeTruthy();
    expect(within(rows[1]!).getByText("Node · worker-a")).toBeTruthy();
  });

  it("makes only a stable incident id interactive and sends that id to the callback", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const registerRowButton = vi.fn();
    render(
      <IssuesTable
        items={[OPENABLE_ISSUE, UNLINKED_ISSUE]}
        onOpen={onOpen}
        registerRowButton={registerRowButton}
      />,
    );

    const open = screen.getByRole("button", { name: "응답 지연이 증가했습니다 상세 열기" });
    expect(open.getAttribute("aria-label")).toBe("응답 지연이 증가했습니다 상세 열기");
    expect(screen.queryByRole("button", { name: /waiting-for-evidence/u })).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();

    await user.click(open);
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledWith("incident-1");
    expect(registerRowButton).toHaveBeenCalledWith("incident-1", expect.any(HTMLButtonElement));
  });

  it("does not expose transport action routes or pull request URLs", () => {
    render(<IssuesTable items={[OPENABLE_ISSUE]} onOpen={vi.fn()} />);

    expect(screen.queryByText("/unsafe/internal-route")).toBeNull();
    expect(screen.queryByText("https://example.invalid/private")).toBeNull();
  });
});

function render(element: ReactElement) {
  return renderBase(element, { wrapper: I18nTestProvider });
}

function I18nTestProvider({ children }: { children: ReactNode }) {
  return (
    <I18nProvider navigatorLanguage="ko-KR" storage={null}>
      {children}
    </I18nProvider>
  );
}

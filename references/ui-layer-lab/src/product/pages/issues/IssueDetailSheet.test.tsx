// @vitest-environment jsdom

import type { ReactElement, ReactNode } from "react";
import { cleanup, render as renderBase, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IssuesPortFailure,
  type IssueDetail,
} from "../../features/issues/issuesContract";
import { I18nProvider } from "../../shared/i18n";
import { IssueDetailSheet } from "./IssueDetailSheet";

afterEach(cleanup);

const DETAIL: IssueDetail = {
  id: "issue:workspace-1/correlation-1",
  workspaceId: "workspace-1",
  requestedIncidentId: "incident-1",
  requestedClusterId: "cluster-1",
  incidentId: "incident-1",
  correlationId: "correlation-1",
  clusterId: "cluster-1",
  namespace: "payments",
  resourceKind: "Deployment",
  resourceName: "checkout-api",
  symptom: "응답 지연이 증가했습니다",
  currentSubject: "deployment/payments/checkout-api",
  status: "investigating",
  rootCause: "메모리 압박으로 Pod가 반복 재시작됐습니다",
  confidence: 0.86,
  supportingEvidence: ["Pod 재시작 증가", "메모리 사용량 증가"],
  missingEvidence: ["최근 배포 이력"],
  evidenceRef: "evidence-1",
  actionRoute: "/unsafe/internal-route",
  commandId: null,
  pullRequestUrl: "https://example.invalid/private",
  errorReason: null,
  updatedAt: "2026-07-13T01:30:00Z",
  dataQualityWarnings: [],
};

describe("IssueDetailSheet", () => {
  it("shows literal status, root cause, and evidence without exposing raw action links", async () => {
    render(
      <IssueDetailSheet
        detail={DETAIL}
        failure={null}
        loading={false}
        onOpenChange={vi.fn()}
        open
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: "인시던트 상세" });
    expect(dialog.className.split(" ")).toContain("w-full");
    expect(dialog.className.split(" ")).toContain("sm:max-w-2xl");
    expect(within(dialog).getByText("investigating")).toBeTruthy();
    expect(within(dialog).getByText("응답 지연이 증가했습니다")).toBeTruthy();
    expect(within(dialog).getByText("메모리 압박으로 Pod가 반복 재시작됐습니다")).toBeTruthy();
    expect(within(dialog).getByText("Pod 재시작 증가")).toBeTruthy();
    expect(within(dialog).getByText("메모리 사용량 증가")).toBeTruthy();
    expect(within(dialog).getByText("최근 배포 이력")).toBeTruthy();
    expect(within(dialog).queryByText("/unsafe/internal-route")).toBeNull();
    expect(within(dialog).queryByText("https://example.invalid/private")).toBeNull();
  });

  it("isolates loading and failure states inside the open sheet", async () => {
    const { rerender } = render(
      <IssueDetailSheet
        detail={null}
        failure={null}
        loading
        onOpenChange={vi.fn()}
        open
      />,
    );

    let dialog = await screen.findByRole("dialog", { name: "인시던트 상세" });
    expect(within(dialog).getByRole("status").textContent)
      .toContain("상세 정보를 불러오는 중입니다");

    rerender(
      <IssueDetailSheet
        detail={null}
        failure={new IssuesPortFailure("not-found")}
        loading={false}
        onOpenChange={vi.fn()}
        open
      />,
    );
    dialog = await screen.findByRole("dialog", { name: "인시던트 상세" });
    expect(within(dialog).getByText("인시던트를 찾을 수 없습니다")).toBeTruthy();
    expect(screen.getByRole("button", { name: "인시던트 상세 닫기" })).toBeTruthy();
  });

  it("delegates Escape closing to the shared Sheet", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <IssueDetailSheet
        detail={DETAIL}
        failure={null}
        loading={false}
        onOpenChange={onOpenChange}
        open
      />,
    );

    await screen.findByRole("dialog", { name: "인시던트 상세" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(onOpenChange).toHaveBeenCalled());
    expect(onOpenChange.mock.calls[0]?.[0]).toBe(false);
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

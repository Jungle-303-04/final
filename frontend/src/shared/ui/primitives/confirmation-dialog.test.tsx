// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmationDialog } from "./confirmation-dialog";

afterEach(cleanup);

function ConfirmationHarness({
  confirmDisabled = false,
  dismissibleWhilePending = false,
  onConfirm = vi.fn(),
  pending = false,
}: {
  confirmDisabled?: boolean;
  dismissibleWhilePending?: boolean;
  onConfirm?: () => void;
  pending?: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <ConfirmationDialog
      cancelLabel="취소"
      className="sm:max-w-xl"
      confirmDisabled={confirmDisabled}
      confirmLabel="확인"
      description="영향 대상과 차이를 확인합니다."
      details="replicas: 2 → 3"
      dismissibleWhilePending={dismissibleWhilePending}
      onConfirm={onConfirm}
      onOpenChange={setOpen}
      open={open}
      pending={pending}
      title="변경 실행"
      variant="warning"
    >
      <p>추가 검증 내용</p>
    </ConfirmationDialog>
  );
}

describe("product-owned ConfirmationDialog", () => {
  it("keeps an invalid confirmation unavailable while preserving owner-supplied content", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmationHarness confirmDisabled onConfirm={onConfirm} />);

    const dialog = screen.getByRole("dialog", { name: "변경 실행" });
    const confirm = screen.getByRole("button", { name: "확인" });
    expect(dialog.className).toContain("sm:max-w-xl");
    expect(screen.getByText("replicas: 2 → 3")).toBeTruthy();
    expect(screen.getByText("추가 검증 내용")).toBeTruthy();
    expect(confirm.hasAttribute("disabled")).toBe(true);
    expect(dialog.querySelector("svg")?.parentElement?.getAttribute("class")).toContain("text-warning-foreground");

    await user.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("blocks cancellation while pending unless the owner explicitly permits dismissal", async () => {
    const user = userEvent.setup();
    render(<ConfirmationHarness pending />);

    expect(screen.queryByRole("button", { name: "닫기" })).toBeNull();
    expect(screen.getByRole("button", { name: "취소" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "확인" }).hasAttribute("disabled")).toBe(true);
    expect(document.querySelector('[data-slot="spinner"]')?.getAttribute("aria-hidden")).toBe("true");

    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "변경 실행" })).toBeTruthy();
  });

  it("closes an explicitly dismissible pending dialog through its cancel action", async () => {
    const user = userEvent.setup();
    render(<ConfirmationHarness dismissibleWhilePending pending />);

    await user.click(screen.getByRole("button", { name: "취소" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "변경 실행" })).toBeNull());
  });
});

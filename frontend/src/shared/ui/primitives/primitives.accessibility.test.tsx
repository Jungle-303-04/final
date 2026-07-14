// @vitest-environment jsdom

import { cleanup, render as renderBase, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, type ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../../i18n";
import { Button } from "./button";
import { Alert, AlertDescription, AlertTitle } from "./alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import { Kbd, KbdGroup } from "./kbd";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
} from "./empty";
import { Skeleton } from "./skeleton";
import { Spinner } from "./spinner";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

afterEach(() => {
  cleanup();
});

describe("product-owned primitive accessibility", () => {
  it("names and describes a dialog, closes on Escape, and restores trigger focus", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger render={<Button variant="outline" />}>
          클러스터 정보 열기
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>클러스터 정보</DialogTitle>
          <DialogDescription>현재 선택한 클러스터의 상태입니다.</DialogDescription>
          <input aria-label="클러스터 별칭" />
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>,
    );

    const trigger = screen.getByRole("button", { name: "클러스터 정보 열기" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "클러스터 정보" });
    const overlay = document.querySelector<HTMLElement>('[data-slot="dialog-overlay"]');
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(dialog.className).toContain("motion-reduce:data-open:animate-none");
    expect(dialog.className).toContain("motion-reduce:data-closed:animate-none");
    expect(dialog.className).toContain("motion-reduce:duration-0");
    expect(overlay?.className).toContain("motion-reduce:data-open:animate-none");
    expect(overlay?.className).toContain("motion-reduce:data-closed:animate-none");
    expect(overlay?.className).toContain("motion-reduce:duration-0");
    expect(screen.getByText("현재 선택한 클러스터의 상태입니다.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "닫기" })).toHaveLength(2);
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "클러스터 별칭" }));
    });

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("renders keyboard input and its group with matching kbd elements", () => {
    const groupRef = createRef<HTMLElement>();
    render(
      <KbdGroup ref={groupRef} aria-label="Control K">
        <Kbd>Ctrl</Kbd>
        <span>+</span>
        <Kbd>K</Kbd>
      </KbdGroup>,
    );

    expect(groupRef.current?.tagName).toBe("KBD");
    expect(screen.getByLabelText("Control K").querySelectorAll("kbd")).toHaveLength(2);
  });

  it("preserves native table caption, header, row, and cell semantics", () => {
    render(
      <Table scrollAreaLabel="클러스터 표 가로 스크롤">
        <TableCaption>클러스터 리소스</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col" aria-sort="ascending">이름</TableHead>
            <TableHead scope="col">상태</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>cluster-1</TableCell>
            <TableCell>Ready</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByRole("table", { name: "클러스터 리소스" })).toBeTruthy();
    const scrollArea = screen.getByRole("region", { name: "클러스터 표 가로 스크롤" });
    expect(scrollArea.getAttribute("tabindex")).toBe("0");
    expect(scrollArea.getAttribute("data-reflow-exempt")).toBe("wide-table-horizontal-scroll");
    expect(screen.getByRole("columnheader", { name: "이름" }).getAttribute("aria-sort")).toBe("ascending");
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.className.includes("motion-reduce:transition-none"))).toBe(true);
    expect(screen.getAllByRole("cell")).toHaveLength(2);
  });

  it("keeps alert and empty copy semantic while hiding visual skeletons", () => {
    const { container } = render(
      <>
        <Alert>
          <AlertTitle>부분 데이터</AlertTitle>
          <AlertDescription>권한이 있는 범위만 표시합니다.</AlertDescription>
        </Alert>
        <Alert aria-live="polite" role="status">
          <AlertTitle>백그라운드 갱신 실패</AlertTitle>
        </Alert>
        <Empty>
          <EmptyHeader>
            <h2>표시할 리소스 없음</h2>
            <EmptyDescription>현재 필터와 일치하는 리소스가 없습니다.</EmptyDescription>
          </EmptyHeader>
        </Empty>
        <Skeleton />
      </>,
    );

    expect(screen.getByRole("alert").textContent).toContain("부분 데이터");
    const politeStatus = screen.getByRole("status");
    expect(politeStatus.textContent).toContain("백그라운드 갱신 실패");
    expect(politeStatus.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByText("현재 필터와 일치하는 리소스가 없습니다.").tagName).toBe("P");
    const skeleton = container.querySelector('[data-slot="skeleton"]');
    expect(skeleton?.getAttribute("aria-hidden")).toBe("true");
    expect(skeleton?.className).toContain("motion-reduce:animate-none");
  });

  it("gives the spinner a localized status name", () => {
    const { rerender } = render(<Spinner />);

    const spinner = screen.getByRole("status", { name: "불러오는 중" });
    expect(spinner.classList.contains("motion-reduce:animate-none")).toBe(true);
    rerender(<Spinner decorative data-icon="inline-start" />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.querySelector('[data-slot="spinner"]')?.getAttribute("aria-hidden")).toBe("true");
  });
});

function render(element: ReactElement) {
  return renderBase(element, {
    wrapper: ({ children }) => (
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        {children}
      </I18nProvider>
    ),
  });
}

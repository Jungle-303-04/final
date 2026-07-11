// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "./button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import { Kbd, KbdGroup } from "./kbd";
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
        </DialogContent>
      </Dialog>,
    );

    const trigger = screen.getByRole("button", { name: "클러스터 정보 열기" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "클러스터 정보" });
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText("현재 선택한 클러스터의 상태입니다.")).toBeTruthy();
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
      <Table>
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
    expect(screen.getByRole("columnheader", { name: "이름" }).getAttribute("aria-sort")).toBe("ascending");
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getAllByRole("cell")).toHaveLength(2);
  });
});

// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResourceTable } from "./ResourceTable";
import { ResourceTableHighlight } from "./ResourceTableHighlight";

interface Row {
  id: string;
  name: string;
  status: number;
}

const columns = [
  {
    cell: (row: Row) => row.name,
    header: "이름",
    id: "name",
    priority: "primary" as const,
    sortValue: (row: Row) => row.name,
  },
  {
    align: "end" as const,
    cell: (row: Row) => row.status,
    header: "상태",
    id: "status",
    priority: "secondary" as const,
    sortValue: (row: Row) => row.status,
  },
];

const rows: Row[] = [
  { id: "b", name: "beta", status: 2 },
  { id: "a", name: "alpha", status: 1 },
  { id: "c", name: "charlie", status: 3 },
];

afterEach(cleanup);

describe("ResourceTable", () => {
  it("keeps one sortable column active and toggles its direction", () => {
    renderTable();

    const nameHeader = screen.getByRole("columnheader", { name: "이름" });
    fireEvent.click(within(nameHeader).getByRole("button"));
    expect(dataRowText()).toEqual(["alpha1", "beta2", "charlie3"]);
    expect(nameHeader.getAttribute("aria-sort")).toBe("ascending");

    fireEvent.click(within(nameHeader).getByRole("button"));
    expect(dataRowText()).toEqual(["charlie3", "beta2", "alpha1"]);
    expect(nameHeader.getAttribute("aria-sort")).toBe("descending");
  });

  it("activates a row with keyboard input", () => {
    const onRowActivate = vi.fn();
    renderTable({ onRowActivate });

    fireEvent.keyDown(screen.getByRole("row", { name: "beta" }), {
      key: "Enter",
    });
    expect(onRowActivate).toHaveBeenCalledWith(rows[0]);
  });

  it("switches to the shared virtual table above 200 rows", () => {
    const manyRows = Array.from({ length: 201 }, (_, index) => ({
      id: String(index),
      name: `row-${index}`,
      status: index,
    }));
    const { container } = renderTable({ rows: manyRows });

    expect(container.querySelector("[data-virtualized='true']")).toBeTruthy();
  });

  it("highlights the global query without changing the source text", () => {
    const { container } = render(
      <ResourceTableHighlight query="YRO" text="Kyro cluster" />,
    );

    expect(screen.getByText("yro").tagName).toBe("MARK");
    expect(container.firstElementChild?.textContent).toBe("Kyro cluster");
  });
});

function renderTable(overrides: Partial<Parameters<typeof ResourceTable<Row>>[0]> = {}) {
  return render(
    <ResourceTable
      ariaLabel="리소스"
      columns={columns}
      emptyState={<span>비어 있음</span>}
      getRowKey={(row) => row.id}
      getRowLabel={(row) => row.name}
      rows={rows}
      {...overrides}
    />,
  );
}

function dataRowText() {
  return screen.getAllByRole("row").slice(1).map((row) => row.textContent);
}

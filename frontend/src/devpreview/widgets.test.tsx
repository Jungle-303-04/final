// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  DASHBOARD_WIDGET_GRID_CLASS,
  DASHBOARD_WIDGET_GRID_ITEM_CLASS,
  Donut,
  HOME_CARD_GRID_CLASS,
  HOME_CARD_GRID_ITEM_CLASS,
  RankList,
  WidgetFrame,
  dashboardWidgetGridStyle,
  dashboardWidgetItemStyle,
  homeCardGridItemStyle,
  homeCardGridStyle,
} from "./widgets";

describe("WidgetFrame navigation", () => {
  it("uses the title and card surface without duplicate deep-link or collapse controls", () => {
    const navigate = vi.fn();
    const rendered = render(
      <WidgetFrame title="저장소 동기화" onDeepLink={navigate}>
        <span>동기화 3</span>
      </WidgetFrame>,
    );

    expect(screen.queryByText("전체 보기")).toBeNull();
    expect(screen.queryByTitle("접기")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "저장소 동기화 화면으로 이동" }));
    expect(navigate).toHaveBeenCalledTimes(1);

    fireEvent.click(rendered.container.firstElementChild as HTMLElement);
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it("keeps nested controls independent from the card destination", () => {
    const navigate = vi.fn();
    const child = vi.fn();
    render(
      <WidgetFrame title="이슈" onDeepLink={navigate}>
        <button type="button" onClick={child}>개별 이슈</button>
      </WidgetFrame>,
    );

    fireEvent.click(screen.getByRole("button", { name: "개별 이슈" }));
    expect(child).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("operates the kebab span, type, edit, and delete controls", () => {
    const resize = vi.fn();
    const changeType = vi.fn();
    const edit = vi.fn();
    const remove = vi.fn();
    render(
      <WidgetFrame
        title="이슈"
        span={2}
        widgetType="W2"
        widgetTypes={[{ id: "W2", title: "이슈" }, { id: "W5", title: "네임스페이스 파드 분포" }]}
        onSpanChange={resize}
        onTypeChange={changeType}
        onEdit={edit}
        onRemove={remove}
      >
        <span>내용</span>
      </WidgetFrame>,
    );

    fireEvent.click(screen.getByRole("button", { name: "이슈 위젯 메뉴" }));
    fireEvent.click(screen.getByRole("button", { name: "이슈 너비 3/4" }));
    expect(resize).toHaveBeenCalledWith(3);

    fireEvent.click(screen.getByRole("button", { name: "이슈 위젯 메뉴" }));
    fireEvent.change(screen.getByRole("combobox", { name: "이슈 위젯 유형" }), { target: { value: "W5" } });
    expect(changeType).toHaveBeenCalledWith("W5");

    fireEvent.click(screen.getByRole("button", { name: "이슈 위젯 메뉴" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "레이아웃 편집" }));
    expect(edit).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "이슈 위젯 메뉴" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "위젯 삭제" }));
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe("home card layout contract", () => {
  it("keeps cluster cards on one stable three-column unit", () => {
    expect(HOME_CARD_GRID_CLASS).toBe("home-card-grid");
    expect(HOME_CARD_GRID_ITEM_CLASS).toBe("home-card-grid-item");
    expect(homeCardGridStyle(false).gridTemplateColumns).toBe("repeat(3, minmax(0, 1fr))");
    expect(homeCardGridStyle(true).gridTemplateColumns).toBe("minmax(0, 1fr)");
    expect(homeCardGridItemStyle(false)).toMatchObject({
      gridColumn: "span 1",
      minHeight: 220,
      aspectRatio: "3 / 2",
    });
    expect(homeCardGridItemStyle(true)).toMatchObject({
      gridColumn: "span 1",
      minHeight: 220,
      aspectRatio: "auto",
    });
  });

  it("uses a four-column dashboard unit and preserves each selected span and height", () => {
    expect(DASHBOARD_WIDGET_GRID_CLASS).toBe("dashboard-widget-grid");
    expect(DASHBOARD_WIDGET_GRID_ITEM_CLASS).toBe("dashboard-widget-grid-item");
    expect(dashboardWidgetGridStyle()).toMatchObject({
      gridAutoRows: 220,
      gap: 12,
    });
    expect(dashboardWidgetItemStyle(1)).toMatchObject({
      "--dashboard-widget-span": 1,
      "--dashboard-widget-span-medium": 1,
      minHeight: 220,
      height: 220,
    });
    expect(dashboardWidgetItemStyle(4)).toMatchObject({
      "--dashboard-widget-span": 4,
      "--dashboard-widget-span-medium": 2,
      minHeight: 220,
      height: 220,
    });
  });
});

describe("Donut responsive legend", () => {
  it("keeps long namespace text flexible while count and percent stay aligned", () => {
    const longNamespace = "production-game-session-handoff-extremely-long-namespace";
    const rendered = render(<Donut items={[{ label: longNamespace, value: 12345 }]} />);

    const layout = rendered.container.querySelector("[data-donut-layout='responsive']") as HTMLElement;
    const row = screen.getByRole("button", { name: new RegExp(longNamespace) });
    const label = screen.getByTitle(longNamespace);
    const count = screen.getByText("12345");
    const percent = screen.getByText("100%");

    expect(layout.style.gridTemplateColumns).toContain("minmax(0, 1fr)");
    expect(row.style.width).toBe("100%");
    expect(row.style.maxWidth).toBe("100%");
    expect(label.style.minWidth).toBe("0px");
    expect(label.style.textOverflow).toBe("ellipsis");
    expect(count.style.width).toBe("44px");
    expect(percent.style.width).toBe("38px");
  });
});

describe("RankList card containment", () => {
  it("scrolls dense ready content inside the stable card instead of crossing its boundary", () => {
    const rendered = render(<RankList rows={Array.from({ length: 8 }, (_, index) => ({
      id: String(index),
      tone: "warn" as const,
      title: `problem-${index}`,
      sub: "game-server-live",
    }))} />);

    const list = rendered.container.querySelector("[data-rank-list-layout='contained']") as HTMLElement;
    expect(list.style.minHeight).toBe("0px");
    expect(list.style.maxHeight).toBe("100%");
    expect(list.style.overflowY).toBe("auto");
  });
});

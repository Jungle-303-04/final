// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EventMessageText } from "./EventMessageText";

describe("EventMessageText", () => {
  afterEach(cleanup);

  it("exposes an unknown event original through a keyboard-operable disclosure", () => {
    const original = "UnrecognizedReason pod/api retry=3";
    render(
      <EventMessageText
        color="#667085"
        fontSize={12}
        message={original}
        reasonLabel="백오프"
      />,
    );

    const disclosure = screen.getByRole("button", { name: "백오프: 이벤트 원문 보기" });
    expect(disclosure.textContent).toContain("이벤트 세부 정보");
    disclosure.focus();
    expect(document.activeElement).toBe(disclosure);
    fireEvent.click(disclosure);
    expect(disclosure.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText("백오프: 이벤트 원문").textContent).toContain(original);
  });

  it("keeps a known event compact while preserving its identifier", () => {
    render(
      <EventMessageText
        color="#667085"
        fontSize={12}
        message="Started container checkout-api"
        reasonLabel="시작됨"
      />,
    );

    expect(screen.getByLabelText("컨테이너 checkout-api 시작")).not.toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

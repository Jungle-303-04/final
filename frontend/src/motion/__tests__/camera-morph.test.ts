// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CAMERA_MORPH_EASING,
  collectMorphRects,
  morph,
  morphTransform,
} from "../useCameraMorph";
import { MOTION_DURATION_MS } from "../useStagger";

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("camera morph", () => {
  it("captures the first rect for each stable morph id", () => {
    const first = document.createElement("div");
    const duplicate = document.createElement("div");
    first.dataset.morphId = "server:cluster-1:0";
    duplicate.dataset.morphId = "server:cluster-1:0";
    first.getBoundingClientRect = () => rect(10, 20, 20, 14);
    duplicate.getBoundingClientRect = () => rect(80, 90, 20, 14);
    document.body.append(first, duplicate);

    const captured = collectMorphRects(document);

    expect(captured.size).toBe(1);
    expect(captured.get("server:cluster-1:0")?.left).toBe(10);
  });

  it("calculates the FLIP inverse from the preview block to the server card", () => {
    expect(morphTransform(
      rect(20, 30, 20, 14),
      rect(100, 70, 200, 140),
    )).toBe("translate(-80px, -40px) scale(0.1, 0.1)");
  });

  it("plays only matched elements with the camera duration and spring easing", () => {
    const target = document.createElement("div");
    target.dataset.morphId = "server:cluster-1:0";
    target.getBoundingClientRect = () => rect(100, 70, 200, 140);
    const animation = {} as Animation;
    const animate = vi.fn(() => animation);
    target.animate = animate;
    document.body.append(target);

    const animations = morph(
      new Map([["server:cluster-1:0", rect(20, 30, 20, 14)]]),
      document,
      { reducedMotion: false },
    );

    expect(animations).toEqual([animation]);
    expect(animate).toHaveBeenCalledWith(
      [
        {
          opacity: 0.6,
          transform: "translate(-80px, -40px) scale(0.1, 0.1)",
        },
        { opacity: 1, transform: "none" },
      ],
      {
        duration: MOTION_DURATION_MS.camera,
        easing: CAMERA_MORPH_EASING,
        fill: "both",
      },
    );
  });

  it("skips Web Animations completely for reduced motion", () => {
    const target = document.createElement("div");
    target.dataset.morphId = "server:cluster-1:0";
    target.getBoundingClientRect = () => rect(100, 70, 200, 140);
    const animate = vi.fn();
    target.animate = animate;
    document.body.append(target);

    expect(morph(
      new Map([["server:cluster-1:0", rect(20, 30, 20, 14)]]),
      document,
      { reducedMotion: true },
    )).toEqual([]);
    expect(animate).not.toHaveBeenCalled();
  });
});

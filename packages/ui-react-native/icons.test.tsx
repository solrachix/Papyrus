import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native-svg", () => {
  const React = require("react");
  const makeComponent =
    (name: string) =>
    ({ children, ...props }: Record<string, unknown>) =>
      React.createElement(name, props, children);

  return {
    default: makeComponent("Svg"),
    Circle: makeComponent("Circle"),
    Defs: makeComponent("Defs"),
    Ellipse: makeComponent("Ellipse"),
    Line: makeComponent("Line"),
    LinearGradient: makeComponent("LinearGradient"),
    Path: makeComponent("Path"),
    Rect: makeComponent("Rect"),
    Stop: makeComponent("Stop"),
  };
});

import {
  IconCopy,
  IconMessageSquareQuote,
  IconPencilLine,
  IconQuote,
  IconToolHighlighter,
  IconToolInk,
  IconToolUnderline,
  IconUnderline,
} from "./icons";

const collectProps = (
  node: React.ReactNode,
  predicate: (props: Record<string, unknown>) => boolean,
  result: Record<string, unknown>[] = []
) => {
  if (!React.isValidElement(node)) return result;

  const props = node.props as Record<string, unknown>;
  if (typeof node.type === "function") {
    return collectProps(
      node.type(props),
      predicate,
      result
    );
  }

  if (predicate(props)) result.push(props);

  React.Children.forEach(props.children as React.ReactNode, (child) => {
    collectProps(child, predicate, result);
  });

  return result;
};

describe("tool icons", () => {
  it("tints the ink pen cap and center band with the selected color", () => {
    const tintedParts = collectProps(
      <IconToolInk color="#ef4444" />,
      (props) => props.fill === "#ef4444"
    );

    expect(tintedParts.length).toBeGreaterThanOrEqual(2);
  });

  it("tints the highlighter tip and center band with the selected color", () => {
    const tintedParts = collectProps(
      <IconToolHighlighter color="#22d3ee" />,
      (props) => props.fill === "#22d3ee"
    );

    expect(tintedParts.length).toBeGreaterThanOrEqual(2);
  });

  it("tints the underline pencil tip and center band with the selected color", () => {
    const tintedParts = collectProps(
      <IconToolUnderline color="#10b981" />,
      (props) => props.fill === "#10b981"
    );

    expect(tintedParts.length).toBeGreaterThanOrEqual(2);
  });

  it("uses the requested Lucide paths for selection actions", () => {
    const paths = [
      ...collectProps(<IconPencilLine color="#111" />, () => true),
      ...collectProps(<IconCopy color="#111" />, () => true),
      ...collectProps(<IconUnderline color="#111" />, () => true),
      ...collectProps(<IconMessageSquareQuote color="#111" />, () => true),
    ]
      .map((props) => props.d)
      .filter((d): d is string => typeof d === "string");

    expect(paths).toEqual(
      expect.arrayContaining([
        "M13 21h8",
        "m15 5 4 4",
        "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
        "M14 14a2 2 0 0 0 2-2V8h-2",
        "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",
        "M8 14a2 2 0 0 0 2-2V8H8",
      ])
    );
  });

  it("renders both quote paths", () => {
    const paths = collectProps(<IconQuote color="#111" />, () => true)
      .map((props) => props.d)
      .filter((d): d is string => typeof d === "string");

    expect(paths).toEqual(
      expect.arrayContaining([
        "M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z",
        "M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z",
      ])
    );
  });
});

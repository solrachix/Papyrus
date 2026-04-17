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
  IconToolHighlighter,
  IconToolInk,
  IconToolUnderline,
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
});

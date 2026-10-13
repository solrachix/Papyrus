import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ReaderContentsView from "./ReaderContentsView";

vi.mock("react-native", async () => {
  const React = await import("react");
  const View = ({ children, testID, style }: any) => React.createElement("div", { "data-testid": testID, "data-style": JSON.stringify(style) }, children);
  const Text = ({ children }: any) => React.createElement("span", null, children);
  const Pressable = ({ children, onPress, accessibilityLabel, disabled, style }: any) =>
    React.createElement("button", { onClick: onPress, "aria-label": accessibilityLabel, disabled, "data-style": JSON.stringify(style) }, children);
  return { View, Text, Pressable, StyleSheet: { create: (styles: any) => styles, hairlineWidth: 1 } };
});
vi.mock("../NativeSheet", async () => {
  const React = await import("react");
  const Sheet = ({ visible, title, children, onClose }: any) => visible
    ? React.createElement("section", null,
        React.createElement("h1", null, title),
        React.createElement("button", { onClick: onClose, "aria-label": "Close sheet" }, "×"),
        children)
    : null;
  return { NativeSheet: Sheet, NativeSheetScrollView: ({ children }: any) => React.createElement("div", null, children) };
});

afterEach(cleanup);

describe("ReaderContentsView", () => {
  it("renders nested entries with depth and forwards the selected item", () => {
    const onSelect = vi.fn();
    const selected = { id: "chapter-2", title: "Capítulo 2", depth: 1 };
    render(
      <ReaderContentsView
        visible
        title="Sumário"
        isDark
        accentColor="#e54f8a"
        entries={[{ id: "chapter-1", title: "Capítulo 1", depth: 0 }, selected]}
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Abrir Capítulo 2" }));
    expect(onSelect).toHaveBeenCalledWith(selected);
    expect(screen.getByRole("button", { name: "Abrir Capítulo 2" }).getAttribute("data-style")).toContain("paddingLeft");
  });

  it("shows an empty state and always allows closing", () => {
    const onClose = vi.fn();
    render(
      <ReaderContentsView
        visible
        title="Sumário"
        isDark={false}
        accentColor="#2563eb"
        entries={[]}
        emptyMessage="Nenhum capítulo disponível"
        onClose={onClose}
      />,
    );
    expect(screen.getByText("Nenhum capítulo disponível")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close sheet" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

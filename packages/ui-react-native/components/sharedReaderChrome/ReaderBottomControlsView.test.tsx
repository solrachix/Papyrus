import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ReaderBottomControlsView from "./ReaderBottomControlsView";

vi.mock("react-native", async () => {
  const React = await import("react");
  const View = ({ children, testID, style }: any) => React.createElement("div", { "data-testid": testID, "data-native-style": JSON.stringify(style) }, children);
  const Text = ({ children }: any) => React.createElement("span", null, children);
  const Pressable = ({ children, onPress, accessibilityLabel, disabled, testID }: any) =>
    React.createElement("button", { onClick: onPress, "aria-label": accessibilityLabel, disabled, "data-testid": testID }, children);
  return { View, Text, Pressable, StyleSheet: { create: (styles: any) => styles } };
});

afterEach(cleanup);

describe("ReaderBottomControlsView", () => {
  it("uses shared action islands and sends navigation/progress callbacks", () => {
    const onContents = vi.fn();
    const onPrevious = vi.fn();
    const onProgress = vi.fn();
    const onNext = vi.fn();
    render(
      <ReaderBottomControlsView
        visible
        isDark
        accentColor="#e54f8a"
        primaryActions={[{ key: "contents", label: "Sumário", icon: "☰", onPress: onContents }]}
        navigation={{
          canGoBackward: true,
          canGoForward: true,
          progressLabel: "Cap. 10 · 1/3",
          progressFraction: 0.34,
          onPrevious,
          onOpenProgress: onProgress,
          onNext,
          previousLabel: "Capítulo anterior",
          nextLabel: "Próximo capítulo",
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sumário" }));
    fireEvent.click(screen.getByRole("button", { name: "Capítulo anterior" }));
    fireEvent.click(screen.getByRole("button", { name: "Cap. 10 · 1/3" }));
    fireEvent.click(screen.getByRole("button", { name: "Próximo capítulo" }));
    expect([onContents, onPrevious, onProgress, onNext].map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1, 1]);
    expect(screen.getByTestId("reader-shared-progress-value")).toBeTruthy();
  });

  it("disables unavailable navigation and omits absent action groups", () => {
    render(
      <ReaderBottomControlsView
        visible
        isDark={false}
        accentColor="#2563eb"
        navigation={{
          canGoBackward: false,
          canGoForward: false,
          progressLabel: "Leitura",
          previousLabel: "Anterior",
          nextLabel: "Próxima",
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "Anterior" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Próxima" }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByTestId("reader-shared-bottom-edit-island")).toBeNull();
  });
});

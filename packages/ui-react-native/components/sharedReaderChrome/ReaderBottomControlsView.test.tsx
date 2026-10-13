import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ReaderBottomControlsView from "./ReaderBottomControlsView";

vi.mock("react-native", async () => {
  const React = await import("react");
  const View = ({ children, testID, style }: any) => React.createElement("div", { "data-testid": testID, "data-native-style": JSON.stringify(style) }, children);
  const Text = ({ children, numberOfLines, ellipsizeMode, testID }: any) => React.createElement("span", { "data-number-of-lines": numberOfLines, "data-ellipsize-mode": ellipsizeMode, "data-testid": testID }, children);
  const Pressable = ({ children, onPress, accessibilityLabel, disabled, testID, style }: any) =>
    React.createElement("button", { onClick: onPress, "aria-label": accessibilityLabel, disabled, "data-testid": testID, "data-native-style": JSON.stringify(style) }, children);
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
          progressLabel: "24% lido",
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
    fireEvent.click(screen.getByRole("button", { name: "24% lido" }));
    fireEvent.click(screen.getByRole("button", { name: "Próximo capítulo" }));
    expect([onContents, onPrevious, onProgress, onNext].map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1, 1]);
    expect(screen.getByTestId("reader-shared-progress-value")).toBeTruthy();
    expect(screen.getByRole("button", { name: "24% lido" }).textContent).toBe("24% lido");
    expect(screen.getByRole("button", { name: "24% lido" }).firstElementChild?.getAttribute("data-number-of-lines")).toBe("1");
    const nativeStyle = JSON.parse(screen.getByRole("button", { name: "24% lido" }).getAttribute("data-native-style")!);
    const progressStyle = Array.isArray(nativeStyle) ? nativeStyle[0] : nativeStyle;
    expect(progressStyle.minWidth).toBeGreaterThanOrEqual(92);
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

  it("keeps the percentage primary and renders a long chapter title as secondary text", () => {
    render(
      <ReaderBottomControlsView
        visible
        isDark={false}
        accentColor="#e54f8a"
        navigation={{
          canGoBackward: true,
          canGoForward: true,
          progressLabel: "24% lido",
          progressDetailLabel: "Um título de capítulo bastante comprido que deve ser secundário",
          previousLabel: "Anterior",
          nextLabel: "Próxima",
        }}
      />,
    );

    expect(screen.getByTestId("reader-shared-progress-primary").textContent).toBe("24% lido");
    expect(screen.getByTestId("reader-shared-progress-detail").textContent).toContain("Um título de capítulo");
    expect(screen.getByRole("button", {name: "24% lido · Um título de capítulo bastante comprido que deve ser secundário"})).toBeTruthy();
  });
});

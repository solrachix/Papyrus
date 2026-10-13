import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ReaderHeaderView from "./ReaderHeaderView";

vi.mock("react-native", async () => {
  const React = await import("react");
  const View = ({ children, testID }: any) =>
    React.createElement("div", { "data-testid": testID }, children);
  const Text = ({ children, accessibilityRole, numberOfLines }: any) =>
    React.createElement("span", { "data-role": accessibilityRole, "data-lines": numberOfLines }, children);
  const Pressable = ({ children, onPress, accessibilityLabel, disabled, testID }: any) =>
    React.createElement("button", { onClick: onPress, "aria-label": accessibilityLabel, disabled, "data-testid": testID }, children);
  return { View, Text, Pressable, StyleSheet: { create: (styles: any) => styles } };
});
vi.mock("react-native-reanimated", async () => {
  const React = await import("react");
  const View = ({ children, testID, style }: any) => React.createElement("div", { "data-testid": testID, "data-style": JSON.stringify(style) }, children);
  return { default: { View } };
});

afterEach(cleanup);

describe("ReaderHeaderView", () => {
  it("renders the shared title and routes back/settings actions", () => {
    const onBack = vi.fn();
    const onSettings = vi.fn();
    render(
      <ReaderHeaderView
        title="Dom Casmurro"
        isDark
        leadingAction={{ label: "Voltar", content: "‹", onPress: onBack }}
        trailingAction={{ label: "Configurações", content: "⚙", onPress: onSettings }}
      />,
    );

    expect(screen.getByText("Dom Casmurro")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    fireEvent.click(screen.getByRole("button", { name: "Configurações" }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(onSettings).toHaveBeenCalledOnce();
  });

  it("does not intercept actions when their callback is unavailable", () => {
    render(
      <ReaderHeaderView
        title="Livro"
        isDark={false}
        leadingAction={{ label: "Voltar", content: "‹" }}
      />,
    );
    expect(screen.getByRole("button", { name: "Voltar" }).hasAttribute("disabled")).toBe(true);
  });
});

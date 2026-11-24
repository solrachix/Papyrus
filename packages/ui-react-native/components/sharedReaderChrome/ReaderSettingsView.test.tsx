import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ReaderSettingsView from "./ReaderSettingsView";

vi.mock("react-native", async () => {
  const React = await import("react");
  const View = ({ children, testID }: any) => React.createElement("div", { "data-testid": testID }, children);
  const Text = ({ children }: any) => React.createElement("span", null, children);
  const Pressable = ({ children, onPress, accessibilityLabel, accessibilityState, disabled }: any) =>
    React.createElement("button", { onClick: onPress, "aria-label": accessibilityLabel, "aria-pressed": accessibilityState?.selected, disabled }, children);
  const Modal = ({ children }: any) => React.createElement("div", null, children);
  const ScrollView = View;
  return { View, Text, Pressable, Modal, ScrollView, Platform: { OS: "ios", select: (o: any) => o.ios ?? o.default }, StyleSheet: { create: (styles: any) => styles, absoluteFillObject: {}, hairlineWidth: 1 } };
});
vi.mock("../NativeSheet", async () => {
  const React = await import("react");
  const Sheet = ({ visible, title, children, onClose, sheetPalette }: any) => visible
    ? React.createElement("section", {
        "aria-label": title,
        "data-sheet-background": sheetPalette?.surface,
        "data-sheet-text": sheetPalette?.text,
      },
        React.createElement("h1", null, title),
        React.createElement("button", { onClick: onClose, "aria-label": "Close sheet" }, "×"),
        children)
    : null;
  return { NativeSheet: Sheet, NativeSheetScrollView: ({ children }: any) => React.createElement("div", null, children) };
});

afterEach(cleanup);

describe("ReaderSettingsView", () => {
  it("renders selected themes, bounded font controls, and optional actions", () => {
    const onTheme = vi.fn();
    const onFont = vi.fn();
    const onContents = vi.fn();
    render(
      <ReaderSettingsView
        visible
        title="Configurações de leitura"
        isDark
        sheetTheme="sepia"
        accentColor="#e54f8a"
        selectedTheme="sepia"
        themeOptions={[
          { value: "light", label: "Claro" },
          { value: "sepia", label: "Sépia" },
          { value: "dark", label: "Escuro" },
          { value: "high-contrast", label: "Alto contraste" },
        ]}
        onThemeChange={onTheme}
        fontSize={{ value: 1, min: 0.8, max: 1.2, step: 0.1, onChange: onFont }}
        actions={[{ key: "contents", label: "Abrir sumário", onPress: onContents }]}
      />,
    );
    expect(screen.getByRole("region", { name: "Configurações de leitura" }).getAttribute("data-sheet-background")).toBe("#f7f0de");
    expect(screen.getByRole("region", { name: "Configurações de leitura" }).getAttribute("data-sheet-text")).toBe("#4a3825");
    expect(screen.getByRole("button", { name: "Tema Sépia" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Tema Alto contraste" }));
    fireEvent.click(screen.getByRole("button", { name: "Diminuir tamanho do texto" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir sumário" }));
    expect(onTheme).toHaveBeenCalledWith("high-contrast");
    expect(onFont).toHaveBeenCalledWith(0.9);
    expect(onContents).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Aumentar tamanho do texto" }).hasAttribute("disabled")).toBe(false);
  });

  it("does not show actions or options without callbacks", () => {
    render(<ReaderSettingsView visible title="Configurações" isDark={false} accentColor="#2563eb" />);
    expect(screen.queryByRole("button", { name: "Abrir sumário" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tema Claro" })).toBeNull();
    expect(screen.getByRole("button", { name: "Close sheet" })).toBeTruthy();
  });
});

describe("ReaderSettingsView typography", () => {
  it("renders EPUB typography groups and reports store patches", async () => {
    const { getEpubTypographyGroups } = await import("../epubTypographyOptions");
    const onChange = vi.fn();
    const groups = getEpubTypographyGroups({ fontFamily: "original", lineHeight: 1.6, margin: "original", textAlign: "original" }, "pt-BR", onChange);
    render(<ReaderSettingsView visible title="Exibição" isDark={false} accentColor="#2563eb" onClose={vi.fn()} choiceGroups={groups} />);
    expect(screen.getByText("Fonte")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Espaçamento entre linhas 1,6" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Fonte Serifada" }));
    expect(onChange).toHaveBeenLastCalledWith({ fontFamily: "serif" });
    fireEvent.click(screen.getByRole("button", { name: "Espaçamento entre linhas Original" }));
    expect(onChange).toHaveBeenLastCalledWith({ lineHeight: null });
    fireEvent.click(screen.getByRole("button", { name: "Margens Larga" }));
    expect(onChange).toHaveBeenLastCalledWith({ margin: "wide" });
    fireEvent.click(screen.getByRole("button", { name: "Alinhamento Justificado" }));
    expect(onChange).toHaveBeenLastCalledWith({ textAlign: "justify" });
  });
});

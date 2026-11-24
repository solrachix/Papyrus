import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useViewerStore } from "@papyrus-sdk/core";
import SettingsSheet from "./SettingsSheet";

vi.mock("react-native", async () => {
  const React = await import("react");
  const passthrough = ({ children }: any) => React.createElement("div", null, children);
  return {
    View: passthrough,
    Text: ({ children }: any) => React.createElement("span", null, children),
    Pressable: ({ children, onPress, accessibilityLabel }: any) =>
      React.createElement("button", { onClick: onPress, "aria-label": accessibilityLabel }, children),
    StyleSheet: { create: (styles: any) => styles, hairlineWidth: 1 },
    Platform: { OS: "android" },
    useWindowDimensions: () => ({ width: 390, height: 844 }),
  };
});
vi.mock("../icons", () => ({ IconZoomIn: () => null, IconZoomOut: () => null, IconClose: () => null }));
vi.mock("./NativeSheet", async () => {
  const React = await import("react");
  return {
    NativeSheet: ({ visible, title, children }: any) =>
      visible ? React.createElement("section", null, React.createElement("h1", null, title), children) : null,
    NativeSheetScrollView: ({ children }: any) => React.createElement("div", null, children),
  };
});

const initial = useViewerStore.getState();
const engine = { rotate: vi.fn(), getRotation: () => 0, setZoom: vi.fn() } as any;

beforeEach(() => useViewerStore.setState({ locale: "pt-BR" }));
afterEach(() => {
  cleanup();
  useViewerStore.setState(initial, true);
});

describe("SettingsSheet for PDF and comics", () => {
  it("shows the PDF options without the stray info row or language switch", () => {
    render(<SettingsSheet engine={engine} documentType="pdf" visible onClose={vi.fn()} onOpenInfo={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Exibição" })).toBeTruthy();
    for (const label of ["Transição de página", "Layout", "Página única", "Página dupla", "Girar", "Zoom", "Aparência", "Tema da página", "Sépia"]) {
      expect(screen.getAllByText(label).length, label).toBeGreaterThan(0);
    }
    expect(screen.queryByText("Informações")).toBeNull();
    expect(screen.queryByText("Idioma")).toBeNull();
    expect(screen.queryByText("Inglês")).toBeNull();
  });

  it("shows the comic options without the language switch", () => {
    render(<SettingsSheet engine={engine} documentType="comic" visible onClose={vi.fn()} />);
    for (const label of ["Layout do quadrinho", "Contínuo", "Ajustar à largura", "Ajustar à página", "Direção de leitura", "Zoom", "Tema da página"]) {
      expect(screen.getAllByText(label).length, label).toBeGreaterThan(0);
    }
    expect(screen.queryByText("Idioma")).toBeNull();
  });

  it("lets hosts hide the light/dark appearance choice", () => {
    render(<SettingsSheet engine={engine} documentType="pdf" visible onClose={vi.fn()} hideAppearance />);
    expect(screen.queryByText("Aparência")).toBeNull();
    expect(screen.queryByText("Claro")).toBeNull();
    expect(screen.getByText("Tema da página")).toBeTruthy();
  });
});

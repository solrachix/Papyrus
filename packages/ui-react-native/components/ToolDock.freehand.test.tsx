import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useViewerStore } from "@papyrus-sdk/core";

vi.mock("react-native", async () => {
  const React = await import("react");
  const view = ({ children, testID }: any) => React.createElement("div", { "data-testid": testID }, children);
  return {
    View: view,
    ScrollView: view,
    Text: ({ children }: any) => React.createElement("span", null, children),
    Pressable: ({ children, onPress, accessibilityLabel, disabled, testID }: any) =>
      React.createElement("button", { onClick: onPress, "aria-label": accessibilityLabel, disabled, "data-testid": testID }, children),
    StyleSheet: { create: (styles: any) => styles, absoluteFillObject: {} },
    useWindowDimensions: () => ({ width: 390, height: 844 }),
  };
});
vi.mock("../icons", () => {
  const Icon = () => null;
  return { IconClose: Icon, IconColorRing: Icon, IconEraser: Icon, IconRedo: Icon, IconToolHighlighter: Icon, IconToolInk: Icon,
    IconToolNote: Icon, IconToolSelect: Icon, IconToolSquiggly: Icon, IconToolStrikeout: Icon, IconToolUnderline: Icon, IconUndo: Icon };
});
vi.mock("./PapyrusSafeArea", () => ({ usePapyrusSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }));

import ToolDock, { resetFreehandHintForTests } from "./ToolDock";

const initial = useViewerStore.getState();
beforeEach(() => {
  resetFreehandHintForTests();
  useViewerStore.setState({ ...initial, locale: "pt-BR", toolDockOpen: true, activeTool: "select" }, true);
});
afterEach(() => {
  cleanup();
  useViewerStore.setState(initial, true);
});

describe("EPUB freehand tool dock", () => {
  it("offers only labelled freehand tools and arms the pen on open", () => {
    render(<ToolDock documentType="epub" />);
    for (const label of ["Caneta", "Marca-texto", "Borracha", "Desfazer", "Refazer", "Cor", "Fechar"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
    for (const label of ["Sublinhar", "Selecionar", "Nota", "Riscado", "Ondulado"]) {
      expect(screen.queryByRole("button", { name: label })).toBeNull();
    }
    expect(screen.getByText("Caneta")).toBeTruthy();
    expect(useViewerStore.getState()).toMatchObject({ activeTool: "ink", activeDrawToolPreset: "ink" });
  });

  it("switches to the highlighter and the eraser", () => {
    render(<ToolDock documentType="epub" />);
    fireEvent.click(screen.getByRole("button", { name: "Marca-texto" }));
    expect(useViewerStore.getState()).toMatchObject({ activeTool: "ink", activeDrawToolPreset: "highlight" });
    expect(screen.getAllByRole("button", { name: /^Espessura/ })).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Borracha" }));
    expect(useViewerStore.getState()).toMatchObject({ activeTool: "ink", activeDrawToolPreset: "eraser" });
  });

  it("shows the freehand hint once and reports it to the host", () => {
    const seen = vi.fn();
    const first = render(<ToolDock documentType="epub" onFreehandHintSeen={seen} />);
    expect(screen.getByText("Desenhe à mão livre sobre a página")).toBeTruthy();
    expect(seen).toHaveBeenCalledTimes(1);
    first.unmount();
    render(<ToolDock documentType="epub" onFreehandHintSeen={seen} />);
    expect(screen.queryByText("Desenhe à mão livre sobre a página")).toBeNull();
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("respects a host-persisted hint flag", () => {
    render(<ToolDock documentType="epub" freehandHintSeen />);
    expect(screen.queryByTestId("papyrus-freehand-hint")).toBeNull();
  });

  it("keeps the full dock for PDF", () => {
    render(<ToolDock documentType="pdf" />);
    expect(screen.queryByRole("button", { name: "Borracha" })).toBeNull();
    expect(screen.getByRole("button", { name: "Selecionar" })).toBeTruthy();
    act(() => undefined);
    expect(useViewerStore.getState().activeTool).toBe("select");
  });
});

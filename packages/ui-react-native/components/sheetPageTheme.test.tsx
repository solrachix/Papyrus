import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useViewerStore } from "@papyrus-sdk/core";
import type { PageTheme } from "@papyrus-sdk/types";
import { getReaderSheetPalette, resolveReaderSheetAppearance } from "./readerSheetPresentation";
import { OverflowSheet } from "./OverflowSheet";
import { DocumentActionsSheet } from "./DocumentActionsSheet";
import { InfoSheet } from "./InfoSheet";
import { PageJumpModal } from "./PageJumpModal";
import { SearchResultsSheet } from "./SearchResultsSheet";
import SettingsSheet from "./SettingsSheet";

const sheets = vi.hoisted(() => ({ calls: [] as any[] }));

vi.mock("react-native", async () => {
  const React = await import("react");
  const passthrough = ({ children }: any) => React.createElement("div", null, children);
  return {
    View: passthrough,
    Text: ({ children }: any) => React.createElement("span", null, children),
    TextInput: () => React.createElement("input"),
    Pressable: ({ children, onPress, accessibilityLabel }: any) =>
      React.createElement("button", { onClick: onPress, "aria-label": accessibilityLabel }, children),
    StyleSheet: { create: (styles: any) => styles, hairlineWidth: 1, absoluteFill: {} },
    Platform: { OS: "android" },
    useWindowDimensions: () => ({ width: 390, height: 844 }),
  };
});
vi.mock("../icons", () => ({ IconZoomIn: () => null, IconZoomOut: () => null, IconClose: () => null }));
vi.mock("./NativeSheet", async () => {
  const React = await import("react");
  return {
    NativeSheet: (props: any) => {
      sheets.calls.push(props);
      return props.visible ? React.createElement("section", null, props.children) : null;
    },
    NativeSheetScrollView: ({ children }: any) => React.createElement("div", null, children),
  };
});

const initial = useViewerStore.getState();
const engine = { rotate: vi.fn(), getRotation: () => 0, setZoom: vi.fn() } as any;

afterEach(() => {
  cleanup();
  sheets.calls = [];
  useViewerStore.setState(initial, true);
});

describe("Papyrus sheets follow the page theme", () => {
  it.each<[PageTheme, string]>([
    ["normal", "light"],
    ["sepia", "sepia"],
    ["dark", "dark"],
    ["high-contrast", "high-contrast"],
  ])("page theme %s gives every sheet the %s palette, even with a dark UI", (pageTheme, sheetTheme) => {
    useViewerStore.setState({ pageTheme, uiTheme: "dark" });
    render(
      <>
        <OverflowSheet visible onClose={vi.fn()} onOpenActions={vi.fn()} />
        <DocumentActionsSheet visible onClose={vi.fn()} />
        <InfoSheet visible documentType="pdf" onClose={vi.fn()} />
        <PageJumpModal visible currentPage={1} pageCount={3} accentColor="#000" onClose={vi.fn()} onConfirm={vi.fn()} />
        <SearchResultsSheet visible documentType="pdf" onClose={vi.fn()} />
        <SettingsSheet engine={engine} documentType="pdf" visible onClose={vi.fn()} />
        <SettingsSheet engine={engine} documentType="comic" visible onClose={vi.fn()} />
      </>,
    );
    expect(sheets.calls.length).toBeGreaterThanOrEqual(7);
    for (const props of sheets.calls) {
      expect(props.sheetTheme).toBe(sheetTheme);
      expect(props.sheetPalette).toEqual(getReaderSheetPalette(sheetTheme as any));
    }
  });

  it("resolves light text only for dark and high contrast", () => {
    expect(resolveReaderSheetAppearance("normal").isDark).toBe(false);
    expect(resolveReaderSheetAppearance("sepia").isDark).toBe(false);
    expect(resolveReaderSheetAppearance("dark").isDark).toBe(true);
    expect(resolveReaderSheetAppearance("high-contrast").isDark).toBe(true);
  });
});

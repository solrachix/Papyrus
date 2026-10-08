import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useViewerStore } from "@papyrus-sdk/core";
import Topbar from "./Topbar";
import BottomBar from "./BottomBar";

const platform = vi.hoisted(() => ({OS: "ios", Version: 18}));
const motion = vi.hoisted(() => ({reduced: false, timing: vi.fn(), listener: null as null | ((value: boolean) => void)}));
vi.mock("react-native", async () => {
  const React = await import("react");
  const view = ({children, testID, pointerEvents, accessibilityElementsHidden, importantForAccessibility, style, ...rest}: any) =>
    React.createElement("div", {"data-testid": testID, "data-pointer-events": pointerEvents,
      "data-native-style": JSON.stringify(style), "aria-hidden": accessibilityElementsHidden || importantForAccessibility === "no-hide-descendants"}, children);
  return {
    View: view, Text: ({children}: any) => React.createElement("span", null, children),
    Pressable: ({children, onPress, accessibilityLabel, disabled, testID, style}: any) => React.createElement("button", {
      onClick: onPress, "aria-label": accessibilityLabel, disabled, "data-testid": testID, "data-native-style": JSON.stringify(style)}, children),
    StyleSheet: {create: (styles: any) => styles},
    Platform: platform, useWindowDimensions: () => ({width: 390, height: 844}),
    AccessibilityInfo: {isReduceMotionEnabled: () => new Promise<boolean>(() => {}),
      addEventListener: (_name: string, cb: (value: boolean) => void) => {motion.listener = cb; return {remove: vi.fn()};}},
  };
});
vi.mock("react-native-reanimated", async () => {
  const React = await import("react");
  const {View} = await import("react-native");
  return {default: {View}, Easing: {out: (v: any) => v, cubic: "cubic"}, ReduceMotion: {System: "system"},
    useReducedMotion: () => motion.reduced,
    useSharedValue: (value: number) => React.useRef({value}).current,
    useAnimatedStyle: (get: () => unknown) => get(),
    withTiming: (value: number, config: unknown) => {motion.timing(value, config); return value;},
    cancelAnimation: vi.fn()};
});
vi.mock("../icons", () => {
  const Icon = () => null;
  return {IconSettings: Icon, IconChevronLeft: Icon, IconChevronRight: Icon,
    IconComment: Icon, IconInfo: Icon, IconSearch: Icon, IconToolDockTrigger: Icon};
});
vi.mock("./PageJumpModal", () => ({PageJumpModal: () => null}));
vi.mock("./PapyrusSafeArea", () => ({usePapyrusSafeAreaInsets: () => ({top: 47, bottom: 34, left: 0, right: 0})}));

const initial = useViewerStore.getState();
const engine = {goToPage: vi.fn()} as any;
const bars = (onBack = vi.fn(), onSettings = vi.fn()) => <>
  <Topbar engine={engine} title="Tarzan" onLogoPress={onBack} logoAccessibilityLabel="Voltar" onOpenSettings={onSettings}/>
  <BottomBar documentType="pdf" onOpenInfo={vi.fn()} onOpenSettings={onSettings}/>
</>;

beforeEach(() => {
  platform.OS = "ios"; platform.Version = 18;
  motion.reduced = false; motion.timing.mockClear(); motion.listener = null;
  useViewerStore.setState({...initial, locale: "pt-BR", nativePdfViewerActive: true,
    activeTool: "select", mobileChromeVisible: true, mobileDockVisible: true}, true);
});
afterEach(async () => {await act(async () => {await Promise.resolve();}); cleanup(); useViewerStore.setState(initial, true);});

describe("PencilKit chrome", () => {
  it("normal Topbar offers settings and drawing replaces it with localized Done", () => {
    const settings = vi.fn(); render(bars(vi.fn(), settings));
    fireEvent.click(screen.getByRole("button", {name: "Open overflow menu"}));
    expect(settings).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", {name: "Concluir"})).toBeNull();
    act(() => useViewerStore.setState({activeTool: "ink"}));
    expect(screen.getByRole("button", {name: "Concluir"})).toBeTruthy();
    expect(screen.queryByRole("button", {name: "Open overflow menu"})).toBeNull();
  });

  it("keeps the same Topbar mounted with hidden chrome and blocks the exiting dock", () => {
    render(bars()); const top = screen.getByTestId("papyrus-floating-top-controls");
    act(() => useViewerStore.setState({activeTool: "ink", mobileChromeVisible: false}));
    expect(screen.getByTestId("papyrus-floating-top-controls")).toBe(top);
    expect(screen.getByRole("button", {name: "Concluir"})).toBeTruthy();
    const bottom = screen.getByTestId("papyrus-bottom-bar-frame");
    expect(bottom.getAttribute("data-pointer-events")).toBe("none");
    expect(bottom.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByTestId("papyrus-mobile-destination-annotate").hasAttribute("disabled")).toBe(true);
  });

  it("Done restores reading and the dock without changing the viewport", () => {
    render(bars()); act(() => useViewerStore.setState({activeTool: "ink", mobileChromeVisible: false, currentPage: 9, zoom: 2}));
    fireEvent.click(screen.getByRole("button", {name: "Concluir"}));
    expect(useViewerStore.getState()).toMatchObject({activeTool: "select", mobileChromeVisible: true, currentPage: 9, zoom: 2});
    expect(screen.getByRole("button", {name: "Open overflow menu"})).toBeTruthy();
    expect(screen.getByTestId("papyrus-bottom-bar-frame").getAttribute("data-pointer-events")).toBe("box-none");
  });

  it("Back finishes drawing before allowing navigation on the next press", () => {
    const back = vi.fn(); render(bars(back)); act(() => useViewerStore.setState({activeTool: "ink"}));
    fireEvent.click(screen.getByRole("button", {name: "Voltar"}));
    expect(back).not.toHaveBeenCalled(); expect(useViewerStore.getState().activeTool).toBe("select");
    fireEvent.click(screen.getByRole("button", {name: "Voltar"})); expect(back).toHaveBeenCalledTimes(1);
  });

  it("does not enter special chrome for compat/EPUB and retains their hiding rules", () => {
    useViewerStore.setState({nativePdfViewerActive: false, activeTool: "ink"}); render(bars());
    expect(screen.queryByRole("button", {name: "Concluir"})).toBeNull();
    expect(screen.getByRole("button", {name: "Open overflow menu"})).toBeTruthy();
    act(() => useViewerStore.setState({mobileChromeVisible: false}));
    expect(screen.queryByTestId("papyrus-floating-top-controls")).toBeNull();
  });

  it.each([["android", 35], ["ios", 15]])("preserves ordinary chrome on %s %s", (os, version) => {
    platform.OS = os as string; platform.Version = version as number;
    useViewerStore.setState({activeTool: "ink"}); render(bars());
    expect(screen.queryByRole("button", {name: "Concluir"})).toBeNull();
    expect(screen.getByRole("button", {name: "Open overflow menu"})).toBeTruthy();
    act(() => useViewerStore.setState({mobileChromeVisible: false}));
    expect(screen.queryByTestId("papyrus-bottom-bar-frame")).toBeNull();
  });

  it("rapid transitions finish with the latest state, same dock and stable action width", () => {
    render(bars()); const dock = screen.getByTestId("papyrus-bottom-bar-frame");
    const width = screen.getByTestId("papyrus-topbar-action-slot").getAttribute("data-native-style");
    for (let i = 0; i < 4; i += 1) {
      act(() => useViewerStore.setState({activeTool: "ink"}));
      fireEvent.click(screen.getByRole("button", {name: "Concluir"}));
    }
    expect(screen.getByTestId("papyrus-bottom-bar-frame")).toBe(dock);
    expect(screen.getByTestId("papyrus-topbar-action-slot").getAttribute("data-native-style")).toBe(width);
    expect(useViewerStore.getState().activeTool).toBe("select");
  });

  it("uses 220ms UI timing and honors reduced motion changes", async () => {
    render(bars()); act(() => useViewerStore.setState({activeTool: "ink"}));
    expect(motion.timing.mock.calls.some(([_, config]) => config.duration === 220 && config.reduceMotion === "system")).toBe(true);
    cleanup(); motion.reduced = true; motion.timing.mockClear(); render(bars());
    await act(async () => {});
    expect(motion.timing.mock.calls.every(([_, config]) => config.duration === 0)).toBe(true);
    expect(motion.listener).not.toBeNull();
    act(() => motion.listener?.(false));
    expect(motion.timing.mock.calls.some(([_, config]) => config.duration === 220)).toBe(true);
  });

  it("uses Done in English and an accessible 44-point action", () => {
    useViewerStore.setState({activeTool: "ink", locale: "en"}); render(bars());
    const done = screen.getByRole("button", {name: "Done"});
    expect(done.getAttribute("data-native-style")).toContain('"minHeight":44');
  });
});

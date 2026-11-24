import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useViewerStore } from "@papyrus-sdk/core";

vi.mock("react-native", async () => {
  const React = await import("react");
  const View = ({ children, testID }: any) => React.createElement("div", { "data-testid": testID }, children);
  return {
    View, ScrollView: View, KeyboardAvoidingView: View,
    Text: ({ children }: any) => React.createElement("span", null, children),
    TextInput: ({ value, onChangeText, onSubmitEditing, accessibilityLabel }: any) =>
      React.createElement("input", { value, "aria-label": accessibilityLabel, onChange: (e: any) => onChangeText(e.target.value), onKeyDown: (e: any) => e.key === "Enter" && onSubmitEditing() }),
    Pressable: ({ children, onPress, accessibilityLabel, disabled, testID }: any) =>
      React.createElement("button", { onClick: onPress, "aria-label": accessibilityLabel, disabled, "data-testid": testID }, children),
    StyleSheet: { create: (s: any) => s, hairlineWidth: 1, absoluteFillObject: {} },
    Keyboard: { dismiss: vi.fn() }, Platform: { OS: "android" },
    useWindowDimensions: () => ({ width: 390, height: 844 }),
  };
});
vi.mock("../icons", () => { const Icon = () => null; return { IconChevronLeft: Icon, IconChevronRight: Icon, IconClose: Icon, IconSearch: Icon }; });
vi.mock("./PapyrusSafeArea", () => ({ usePapyrusSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock("./NativeSheet", async () => {
  const React = await import("react");
  return {
    NativeSheet: ({ visible, title, children }: any) => visible ? React.createElement("section", { "aria-label": title }, children) : null,
    NativeSheetScrollView: ({ children, testID }: any) => React.createElement("div", { "data-testid": testID }, children),
  };
});

import { SearchOverlay } from "./SearchOverlay";

const initial = useViewerStore.getState();
const engine = {
  getPageCount: () => 3,
  getTextContent: async (pageIndex: number) => [{ str: pageIndex === 1 ? "No meio do caminho tinha uma pedra, uma pedra no caminho" : "nada aqui" }],
  searchText: async () => [
    { pageIndex: 1, text: "No meio do caminho tinha uma pedra", matchIndex: 0 },
    { pageIndex: 2, text: "outra pedra adiante", matchIndex: 0 },
  ],
} as any;

beforeEach(() => useViewerStore.setState({ ...initial, locale: "pt-BR", isLoaded: true, pageCount: 3,
  outline: [{ title: "Poema", pageIndex: 1 }] as any }, true));
afterEach(() => { cleanup(); useViewerStore.setState(initial, true); });

describe("EPUB search sheet", () => {
  it("shows no counter before the first search", () => {
    render(<SearchOverlay engine={engine} documentType="epub" visible onClose={vi.fn()} />);
    expect(screen.getByRole("region", { name: "Buscar" })).toBeTruthy();
    expect(screen.queryByText(/0\/0/)).toBeNull();
    expect(screen.queryByText("Nenhum resultado.")).toBeNull();
  });

  it("lists results with chapter labels, jumps to one and steps with previous/next", async () => {
    render(<SearchOverlay engine={engine} documentType="epub" visible onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar" }), { target: { value: "pedra" } });
    await act(async () => { fireEvent.keyDown(screen.getByRole("textbox", { name: "Buscar" }), { key: "Enter" }); });
    const results = await screen.findAllByRole("button", { name: /pedra/ });
    expect(results.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^pedra\u200B?$/).length).toBeGreaterThan(0);
    expect(screen.getByText(/resultados/)).toBeTruthy();
    fireEvent.click(results[0]);
    expect(screen.getByTestId("papyrus-search-navigator")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Buscar" })).toBeNull();
    expect(useViewerStore.getState()).toMatchObject({ activeSearchIndex: 0, currentPage: 2, scrollToPageSignal: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Próximo resultado" }));
    expect(useViewerStore.getState().activeSearchIndex).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Ver resultados" }));
    expect(screen.getByRole("region", { name: "Buscar" })).toBeTruthy();
  });

  it("goes straight to the match location when the result has one, without re-opening the chapter", async () => {
    const goToEpubLocation = vi.fn(async () => undefined);
    const goToPage = vi.fn();
    const cfiEngine = {
      ...engine,
      goToEpubLocation,
      goToPage,
      searchText: async () => [
        { pageIndex: 1, text: "uma pedra", matchIndex: 0, cfi: "epubcfi(/6/4!/4/2/1:10)" },
        { pageIndex: 1, text: "outra pedra", matchIndex: 1, cfi: "epubcfi(/6/4!/4/2/1:40)" },
        { pageIndex: 2, text: "pedra adiante", matchIndex: 0 },
      ],
    } as any;
    render(<SearchOverlay engine={cfiEngine} documentType="epub" visible onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar" }), { target: { value: "pedra" } });
    await act(async () => { fireEvent.keyDown(screen.getByRole("textbox", { name: "Buscar" }), { key: "Enter" }); });
    fireEvent.click((await screen.findAllByRole("button", { name: /uma pedra/ }))[0]);
    expect(goToEpubLocation).toHaveBeenLastCalledWith("epubcfi(/6/4!/4/2/1:10)");
    expect(useViewerStore.getState().scrollToPageSignal).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Próximo resultado" }));
    expect(goToEpubLocation).toHaveBeenLastCalledWith("epubcfi(/6/4!/4/2/1:40)");
    expect(useViewerStore.getState()).toMatchObject({ activeSearchIndex: 1, scrollToPageSignal: null });

    // A result without a location still goes to its chapter.
    fireEvent.click(screen.getByRole("button", { name: "Próximo resultado" }));
    expect(useViewerStore.getState()).toMatchObject({ activeSearchIndex: 2, scrollToPageSignal: 2 });

    fireEvent.click(screen.getByRole("button", { name: "Resultado anterior" }));
    expect(goToEpubLocation).toHaveBeenLastCalledWith("epubcfi(/6/4!/4/2/1:40)");
    expect(useViewerStore.getState().activeSearchIndex).toBe(1);
  });

  it("clears the query and the results", async () => {
    render(<SearchOverlay engine={engine} documentType="epub" visible onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar" }), { target: { value: "pedra" } });
    await act(async () => { fireEvent.keyDown(screen.getByRole("textbox", { name: "Buscar" }), { key: "Enter" }); });
    fireEvent.click(screen.getByRole("button", { name: "Limpar busca" }));
    expect(useViewerStore.getState().searchResults).toHaveLength(0);
    expect((screen.getByRole("textbox", { name: "Buscar" }) as HTMLInputElement).value).toBe("");
  });
});

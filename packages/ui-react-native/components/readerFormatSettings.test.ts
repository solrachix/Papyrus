import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

import {
  createReaderFormatSettingsSetters,
  getReaderFormatSettingsGroups,
  getReaderZoomStepper,
  resolveLayoutViewMode,
  resolveTransitionViewMode,
} from "./readerFormatSettings";

const byKey = (groups: ReturnType<typeof getReaderFormatSettingsGroups>) =>
  Object.fromEntries(groups.map((group) => [group.key, group]));

describe("getReaderFormatSettingsGroups", () => {
  it("builds the PDF transition, layout and rotation rows in Portuguese", () => {
    const onViewModeChange = vi.fn();
    const onRotate = vi.fn();
    const onResetRotation = vi.fn();
    const groups = getReaderFormatSettingsGroups(
      "pdf",
      { viewMode: "continuous" },
      { onViewModeChange, onRotate, onResetRotation },
      "pt-BR",
    );
    expect(groups.map((group) => group.key)).toEqual(["pageTransition", "layout", "rotate"]);
    const { pageTransition, layout, rotate } = byKey(groups);

    expect(pageTransition.label).toBe("Transição de página");
    expect(pageTransition.value).toBe("continuous");
    expect(pageTransition.options.map((o) => o.label)).toEqual(["Contínuo", "Página por página"]);
    pageTransition.onChange("paged");
    expect(onViewModeChange).toHaveBeenLastCalledWith("single");

    expect(layout.value).toBe("single");
    expect(layout.options.map((o) => o.label)).toEqual(["Página única", "Página dupla"]);
    layout.onChange("double");
    expect(onViewModeChange).toHaveBeenLastCalledWith("double");

    expect(rotate.kind).toBe("action");
    expect(rotate.value).toBe("");
    expect(rotate.options.map((o) => o.label)).toEqual(["Sentido anti-horário", "Original / 0°", "Sentido horário"]);
    rotate.onChange("clockwise");
    expect(onRotate).toHaveBeenLastCalledWith("clockwise");
    rotate.onChange("counterclockwise");
    expect(onRotate).toHaveBeenLastCalledWith("counterclockwise");
    rotate.onChange("original");
    expect(onResetRotation).toHaveBeenCalledTimes(1);
  });

  it("reflects paged and double-page view modes", () => {
    const setters = { onViewModeChange: vi.fn() };
    expect(byKey(getReaderFormatSettingsGroups("pdf", { viewMode: "single" }, setters, "en")).pageTransition.value).toBe("paged");
    const double = byKey(getReaderFormatSettingsGroups("pdf", { viewMode: "double" }, setters, "en"));
    expect(double.pageTransition.value).toBe("continuous");
    expect(double.layout.value).toBe("double");
    double.layout.onChange("single");
    expect(setters.onViewModeChange).toHaveBeenLastCalledWith("continuous");
  });

  it("omits rotation reset without a handler and groups without setters", () => {
    const groups = getReaderFormatSettingsGroups("pdf", {}, { onRotate: vi.fn() }, "en");
    expect(groups.map((group) => group.key)).toEqual(["rotate"]);
    expect(groups[0].options.map((o) => o.value)).toEqual(["counterclockwise", "clockwise"]);
  });

  it("builds the comic layout, fit and direction rows", () => {
    const setters = {
      onComicLayoutModeChange: vi.fn(),
      onComicFitModeChange: vi.fn(),
      onComicReadingDirectionChange: vi.fn(),
    };
    const groups = getReaderFormatSettingsGroups(
      "comic",
      { comicLayoutMode: "continuous", comicFitMode: "page", comicReadingDirection: "rtl" },
      setters,
      "pt-BR",
    );
    expect(groups.map((group) => [group.key, group.label, group.value])).toEqual([
      ["comicLayout", "Layout do quadrinho", "continuous"],
      ["comicFit", "Ajuste da página", "page"],
      ["comicDirection", "Direção de leitura", "rtl"],
    ]);
    const { comicLayout, comicFit, comicDirection } = byKey(groups);
    expect(comicFit.options.map((o) => o.label)).toEqual(["Ajustar à largura", "Ajustar à página"]);
    comicLayout.onChange("single");
    comicFit.onChange("width");
    comicDirection.onChange("ltr");
    expect(setters.onComicLayoutModeChange).toHaveBeenCalledWith("single");
    expect(setters.onComicFitModeChange).toHaveBeenCalledWith("width");
    expect(setters.onComicReadingDirectionChange).toHaveBeenCalledWith("ltr");
  });

  it("returns nothing for EPUB and text", () => {
    const setters = { onViewModeChange: vi.fn(), onRotate: vi.fn() };
    expect(getReaderFormatSettingsGroups("epub", {}, setters, "en")).toEqual([]);
    expect(getReaderFormatSettingsGroups("text", {}, setters, "en")).toEqual([]);
  });
});

describe("view mode helpers", () => {
  it("keeps double page when switching to continuous and leaves single layout alone", () => {
    expect(resolveTransitionViewMode("double", "continuous")).toBe("double");
    expect(resolveTransitionViewMode("single", "continuous")).toBe("continuous");
    expect(resolveTransitionViewMode("double", "paged")).toBe("single");
    expect(resolveLayoutViewMode("single", "single")).toBe("single");
    expect(resolveLayoutViewMode("double", "single")).toBe("continuous");
  });
});

describe("getReaderZoomStepper", () => {
  it("clamps PDF zoom to 50–400% and comics to 100–400%", () => {
    const onZoom = vi.fn();
    const pdf = getReaderZoomStepper("pdf", 1.2, onZoom, "pt-BR")!;
    expect(pdf).toMatchObject({ key: "zoom", label: "Zoom", min: 0.5, max: 4, step: 0.1, formattedValue: "120%", decreaseLabel: "Diminuir zoom", increaseLabel: "Aumentar zoom" });
    pdf.onChange(0.1);
    expect(onZoom).toHaveBeenLastCalledWith(0.5);
    pdf.onChange(1.3000000000000003);
    expect(onZoom).toHaveBeenLastCalledWith(1.3);
    const comic = getReaderZoomStepper("comic", 1, onZoom, "en")!;
    expect(comic.min).toBe(1);
    comic.onChange(0.9);
    expect(onZoom).toHaveBeenLastCalledWith(1);
    expect(getReaderZoomStepper("epub", 1, onZoom, "en")).toBeNull();
  });
});

describe("createReaderFormatSettingsSetters", () => {
  it("drives the engine and the viewer store like SettingsSheet", () => {
    let rotation = 0;
    const engine = {
      rotate: vi.fn((direction: string) => {
        rotation = (rotation + (direction === "clockwise" ? 90 : 270)) % 360;
      }),
      getRotation: () => rotation,
      setZoom: vi.fn(),
    };
    const setDocumentState = vi.fn();
    const setters = createReaderFormatSettingsSetters(engine as any, setDocumentState);
    setters.onRotate("clockwise");
    expect(setDocumentState).toHaveBeenLastCalledWith({ rotation: 90 });
    setters.onResetRotation?.();
    expect(rotation).toBe(0);
    expect(setDocumentState).toHaveBeenLastCalledWith({ rotation: 0 });
    setters.onZoomChange(1.5);
    expect(engine.setZoom).toHaveBeenCalledWith(1.5);
    expect(setDocumentState).toHaveBeenLastCalledWith({ zoom: 1.5 });
    setters.onComicFitModeChange("page");
    expect(setDocumentState).toHaveBeenLastCalledWith({ comicFitMode: "page" });
    expect(createReaderFormatSettingsSetters(engine as any, setDocumentState, { allowRotationReset: false }).onResetRotation).toBeUndefined();
  });
});

describe("public API", () => {
  it("exports the format settings helpers for hosts", () => {
    const index = readFileSync(resolve(__dirname, "..", "index.ts"), "utf8");
    for (const name of ["getReaderFormatSettingsGroups", "getReaderZoomStepper", "createReaderFormatSettingsSetters", "ReaderSettingsStepper", "resolveReaderSheetAppearance"]) {
      expect(index).toContain(name);
    }
  });
});

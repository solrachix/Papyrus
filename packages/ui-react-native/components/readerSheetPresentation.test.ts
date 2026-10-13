import { describe, expect, it } from "vitest";
import {
  getAnnotationKindLabel,
  getNativeSheetPalette,
  getReaderSheetPalette,
  toReaderSheetTheme,
} from "./readerSheetPresentation";

describe("reader sheet presentation", () => {
  it("uses the Papyrus ivory and navy surfaces for both reader themes", () => {
    expect(getReaderSheetPalette(false)).toEqual({
      surface: "#fbfaf6",
      elevatedSurface: "#f4f7fb",
      activeSurface: "#eaf0fb",
      text: "#17263b",
      mutedText: "#70809a",
      divider: "#d9e1ec",
      closeSurface: "#eef2f7",
    });

    expect(getReaderSheetPalette(true)).toEqual({
      surface: "#111318",
      elevatedSurface: "#1a1e27",
      activeSurface: "#203152",
      text: "#f7f1e8",
      mutedText: "#9aaabd",
      divider: "#2b3445",
      closeSurface: "#1b2230",
    });
  });

  it("localizes annotation kinds without changing their marker color", () => {
    expect(getAnnotationKindLabel("comment", "pt-BR")).toBe("NOTA");
    expect(getAnnotationKindLabel("highlight", "pt-BR")).toBe("DESTAQUE");
    expect(getAnnotationKindLabel("underline", "en")).toBe("UNDERLINE");
  });

  it("uses the same neutral palette for the shared native sheet", () => {
    expect(getNativeSheetPalette(true).backgroundColor).toBe("#111318");
    expect(getNativeSheetPalette(false).backgroundColor).toBe("#fbfaf6");
  });

  it("maps each page theme to a complete settings-sheet palette", () => {
    expect(toReaderSheetTheme("normal")).toBe("light");
    expect(getReaderSheetPalette("light")).toMatchObject({
      surface: "#fbfaf6",
      text: "#17263b",
    });
    expect(getReaderSheetPalette("sepia")).toMatchObject({
      surface: "#f7f0de",
      elevatedSurface: "#f0e6cc",
      activeSurface: "#e8d9b7",
      text: "#4a3825",
      mutedText: "#76634d",
      divider: "#d6c6a6",
      closeSurface: "#eadfc5",
    });
    expect(getReaderSheetPalette("dark")).toMatchObject({
      surface: "#111318",
      text: "#f7f1e8",
    });
    expect(getReaderSheetPalette("high-contrast")).toMatchObject({
      surface: "#000000",
      elevatedSurface: "#000000",
      activeSurface: "#1a1a1a",
      text: "#ffffff",
      mutedText: "#ffffff",
      divider: "#ffffff",
      closeSurface: "#000000",
    });
    expect(toReaderSheetTheme("high-contrast")).toBe("high-contrast");
  });
});

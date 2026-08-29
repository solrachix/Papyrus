import { describe, expect, it } from "vitest";
import {
  getAnnotationKindLabel,
  getReaderSheetPalette,
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
});

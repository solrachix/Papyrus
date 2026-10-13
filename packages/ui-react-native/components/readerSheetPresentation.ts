import type { Locale, PageTheme } from "@papyrus-sdk/types";

export type ReaderSheetTheme = "light" | "sepia" | "dark" | "high-contrast";

export type ReaderSheetPalette = {
  surface: string;
  elevatedSurface: string;
  activeSurface: string;
  text: string;
  mutedText: string;
  divider: string;
  closeSurface: string;
};

const LIGHT_PALETTE: ReaderSheetPalette = {
  surface: "#fbfaf6",
  elevatedSurface: "#f4f7fb",
  activeSurface: "#eaf0fb",
  text: "#17263b",
  mutedText: "#70809a",
  divider: "#d9e1ec",
  closeSurface: "#eef2f7",
};

const DARK_PALETTE: ReaderSheetPalette = {
  surface: "#111318",
  elevatedSurface: "#1a1e27",
  activeSurface: "#203152",
  text: "#f7f1e8",
  mutedText: "#9aaabd",
  divider: "#2b3445",
  closeSurface: "#1b2230",
};

const SEPIA_PALETTE: ReaderSheetPalette = {
  surface: "#f7f0de",
  elevatedSurface: "#f0e6cc",
  activeSurface: "#e8d9b7",
  text: "#4a3825",
  mutedText: "#76634d",
  divider: "#d6c6a6",
  closeSurface: "#eadfc5",
};

const HIGH_CONTRAST_PALETTE: ReaderSheetPalette = {
  surface: "#000000",
  elevatedSurface: "#000000",
  activeSurface: "#1a1a1a",
  text: "#ffffff",
  mutedText: "#ffffff",
  divider: "#ffffff",
  closeSurface: "#000000",
};

export const toReaderSheetTheme = (pageTheme: PageTheme): ReaderSheetTheme =>
  pageTheme === "normal" ? "light" : pageTheme;

export const getReaderSheetPalette = (
  theme: boolean | ReaderSheetTheme,
): ReaderSheetPalette => {
  const normalized = typeof theme === "boolean" ? (theme ? "dark" : "light") : theme;
  switch (normalized) {
    case "sepia":
      return SEPIA_PALETTE;
    case "dark":
      return DARK_PALETTE;
    case "high-contrast":
      return HIGH_CONTRAST_PALETTE;
    default:
      return LIGHT_PALETTE;
  }
};

export const getNativeSheetPalette = (theme: boolean | ReaderSheetTheme) => {
  const palette = getReaderSheetPalette(theme);
  return {
    backgroundColor: palette.surface,
    borderColor: palette.divider,
    closeBackgroundColor: palette.closeSurface,
    textColor: palette.text,
  };
};

const ANNOTATION_KIND_LABELS: Record<string, { en: string; "pt-BR": string }> =
  {
    comment: { en: "NOTE", "pt-BR": "NOTA" },
    text: { en: "NOTE", "pt-BR": "NOTA" },
    highlight: { en: "HIGHLIGHT", "pt-BR": "DESTAQUE" },
    underline: { en: "UNDERLINE", "pt-BR": "SUBLINHADO" },
    squiggly: { en: "SQUIGGLY", "pt-BR": "ONDULADO" },
    strikeout: { en: "STRIKEOUT", "pt-BR": "RISCADO" },
    ink: { en: "INK", "pt-BR": "TINTA" },
  };

export const getAnnotationKindLabel = (kind: string, locale: Locale): string =>
  (ANNOTATION_KIND_LABELS[kind]?.[locale] ?? kind).toUpperCase();

import type { Locale } from "@papyrus-sdk/types";

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

export const getReaderSheetPalette = (isDark: boolean): ReaderSheetPalette =>
  isDark ? DARK_PALETTE : LIGHT_PALETTE;

export const getNativeSheetPalette = (isDark: boolean) => {
  const palette = getReaderSheetPalette(isDark);
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

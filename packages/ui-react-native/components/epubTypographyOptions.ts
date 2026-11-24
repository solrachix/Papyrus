import { Platform } from "react-native";
import type { EpubTypography, Locale } from "@papyrus-sdk/types";
import { getStrings } from "../mobileStrings";
import type { ReaderSettingsChoiceGroup } from "./sharedReaderChrome/types";

const LINE_HEIGHTS = [1.2, 1.4, 1.6, 1.8, 2.0] as const;
const ORIGINAL = "original";

/**
 * Typography choice groups for the reading settings sheet (Papyrus' own
 * SettingsSheet and hosts rendering ReaderSettingsView). Values are strings
 * so the groups fit the shared chrome; onChange receives a store patch.
 */
export function getEpubTypographyGroups(
  typography: EpubTypography,
  locale: Locale | undefined,
  onChange: (patch: Partial<EpubTypography>) => void,
  /** Host fonts registered with setEpubCustomFonts, shown after the built-ins. */
  customFonts: { id: string; label: string; previewFontFamily?: string }[] = [],
): ReaderSettingsChoiceGroup[] {
  const t = getStrings(locale);
  const ios = Platform?.OS === "ios";
  return [
    {
      key: "fontFamily",
      label: t.typographyFont,
      value: typography.fontFamily,
      options: [
        // Each option previews itself as "Aa" in that font (as the app's
        // appearance picker does); "original" uses the system font.
        { value: "original", label: t.typographyOriginal, previewFontFamily: (ios ? "System" : "sans-serif") },
        { value: "serif", label: t.typographySerif, previewFontFamily: (ios ? "Georgia" : "serif") },
        { value: "sans", label: t.typographySans, previewFontFamily: (ios ? "Helvetica Neue" : "sans-serif-medium") },
        { value: "mono", label: t.typographyMono, previewFontFamily: (ios ? "Menlo" : "monospace") },
        ...customFonts.map((font) => ({ value: `custom:${font.id}`, label: font.label, previewFontFamily: font.previewFontFamily })),
      ],
      onChange: (value) => onChange({ fontFamily: value as EpubTypography["fontFamily"] }),
    },
    {
      key: "lineHeight",
      label: t.typographyLineHeight,
      value: typography.lineHeight === null ? ORIGINAL : String(typography.lineHeight),
      options: [
        { value: ORIGINAL, label: t.typographyOriginal },
        ...LINE_HEIGHTS.map((value) => ({ value: String(value), label: value.toFixed(1).replace(".", locale === "pt-BR" ? "," : ".") })),
      ],
      onChange: (value) => onChange({ lineHeight: value === ORIGINAL ? null : Number(value) }),
    },
    {
      key: "margin",
      label: t.typographyMargins,
      value: typography.margin,
      options: [
        { value: "original", label: t.typographyOriginal },
        { value: "narrow", label: t.typographyNarrow },
        { value: "medium", label: t.typographyMedium },
        { value: "wide", label: t.typographyWide },
      ],
      onChange: (value) => onChange({ margin: value as EpubTypography["margin"] }),
    },
    {
      key: "textAlign",
      label: t.typographyAlignment,
      value: typography.textAlign,
      options: [
        { value: "original", label: t.typographyOriginal },
        { value: "justify", label: t.typographyJustify },
        { value: "left", label: t.typographyLeft },
      ],
      onChange: (value) => onChange({ textAlign: value as EpubTypography["textAlign"] }),
    },
  ];
}

import type { Locale } from "@papyrus-sdk/types";
import { getStrings } from "../../mobileStrings";

export const READER_SELECTION_ACTIONS = {
  copy: "copy",
  highlight: "highlight",
  underline: "underline",
  note: "note",
  consult: "consult",
} as const;

export type ReaderSelectionActionId =
  (typeof READER_SELECTION_ACTIONS)[keyof typeof READER_SELECTION_ACTIONS];

export interface ReaderSelectionActionOption {
  id: ReaderSelectionActionId;
  label: string;
}

/** Shared action IDs keep Papyrus WebView and native EPUB engines in sync. */
export function getReaderSelectionActionOptions(
  locale: Locale | undefined,
): ReaderSelectionActionOption[] {
  const strings = getStrings(locale);
  return [
    { id: READER_SELECTION_ACTIONS.copy, label: strings.copy },
    { id: READER_SELECTION_ACTIONS.highlight, label: strings.annotationHighlight },
    { id: READER_SELECTION_ACTIONS.underline, label: strings.annotationUnderline },
    { id: READER_SELECTION_ACTIONS.note, label: strings.annotationNote },
    {
      id: READER_SELECTION_ACTIONS.consult,
      label: locale === "pt-BR" ? "Consultar" : strings.define,
    },
  ];
}

export function normalizeReaderSelectionActionId(
  action: unknown,
): ReaderSelectionActionId | null {
  switch (action) {
    case "copy":
    case "highlight":
    case "underline":
    case "note":
    case "consult":
      return action;
    case "comment":
      return READER_SELECTION_ACTIONS.note;
    case "define":
      return READER_SELECTION_ACTIONS.consult;
    default:
      return null;
  }
}

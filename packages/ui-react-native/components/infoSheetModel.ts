import {
  DocumentType,
  Locale,
  PageTheme,
  UITheme,
  ViewMode,
} from "@papyrus-sdk/types";

export type InfoRow = {
  label: string;
  value: string;
};

type BuildInfoRowsInput = {
  title?: string;
  documentType: DocumentType;
  currentPage: number;
  pageCount: number;
  zoom: number;
  rotation: number;
  viewMode: ViewMode;
  uiTheme: UITheme;
  pageTheme: PageTheme;
  locale: Locale;
};

const roundPercent = (value: number) =>
  Math.max(0, Math.min(100, Math.round(value)));

const labels = {
  en: {
    fileName: "File name",
    type: "Type",
    pages: "Pages",
    currentPage: "Current page",
    progress: "Progress",
    zoom: "Zoom",
    rotation: "Rotation",
    layout: "Layout",
    appearance: "Appearance",
    pageTheme: "Page theme",
    language: "Language",
  },
  "pt-BR": {
    fileName: "Nome do arquivo",
    type: "Tipo",
    pages: "Páginas",
    currentPage: "Página atual",
    progress: "Progresso",
    zoom: "Zoom",
    rotation: "Rotação",
    layout: "Layout",
    appearance: "Aparência",
    pageTheme: "Tema da página",
    language: "Idioma",
  },
} as const;

const typeLabel = (documentType: DocumentType, locale: Locale) => {
  if (locale === "pt-BR") {
    if (documentType === "pdf") return "Documento PDF";
    if (documentType === "epub") return "Documento EPUB";
    return "Documento de texto";
  }

  if (documentType === "pdf") return "PDF document";
  if (documentType === "epub") return "EPUB document";
  return "Text document";
};

const themeLabel = (pageTheme: PageTheme, locale: Locale) => {
  const pt = locale === "pt-BR";
  switch (pageTheme) {
    case "sepia":
      return "Sepia";
    case "dark":
      return pt ? "Escuro" : "Dark";
    case "high-contrast":
      return pt ? "Contraste" : "High contrast";
    default:
      return pt ? "Original" : "Original";
  }
};

const appearanceLabel = (uiTheme: UITheme, locale: Locale) =>
  locale === "pt-BR"
    ? uiTheme === "dark"
      ? "Escuro"
      : "Claro"
    : uiTheme === "dark"
    ? "Dark"
    : "Light";

const layoutLabel = (viewMode: ViewMode, locale: Locale) => {
  const pt = locale === "pt-BR";
  switch (viewMode) {
    case "double":
      return pt ? "Página dupla" : "Double page";
    case "single":
      return pt ? "Página única" : "Single page";
    default:
      return pt ? "Contínuo" : "Continuous";
  }
};

const languageLabel = (locale: Locale) =>
  locale === "pt-BR" ? "Português (BR)" : "English";

export const buildInfoRows = ({
  title,
  documentType,
  currentPage,
  pageCount,
  zoom,
  rotation,
  viewMode,
  uiTheme,
  pageTheme,
  locale,
}: BuildInfoRowsInput): InfoRow[] => {
  const l = labels[locale] ?? labels.en;
  const total = Math.max(pageCount, 1);
  const progress = `${roundPercent((currentPage / total) * 100)}%`;

  return [
    { label: l.fileName, value: title?.trim() || "Papyrus" },
    { label: l.type, value: typeLabel(documentType, locale) },
    { label: l.pages, value: String(pageCount || 0) },
    { label: l.currentPage, value: String(currentPage) },
    { label: l.progress, value: progress },
    { label: l.zoom, value: `${Math.round(zoom * 100)}%` },
    { label: l.rotation, value: `${rotation}°` },
    { label: l.layout, value: layoutLabel(viewMode, locale) },
    { label: l.appearance, value: appearanceLabel(uiTheme, locale) },
    { label: l.pageTheme, value: themeLabel(pageTheme, locale) },
    { label: l.language, value: languageLabel(locale) },
  ];
};

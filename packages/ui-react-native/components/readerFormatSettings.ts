import { Platform } from "react-native";
import type {
  ComicFitMode,
  ComicLayoutMode,
  ComicReadingDirection,
  DocumentEngine,
  DocumentType,
  Locale,
  ViewMode,
} from "@papyrus-sdk/types";
import { getStrings } from "../mobileStrings";
import { resetEngineRotation } from "./rotationReset";
import type {
  ReaderSettingsChoiceGroup,
  ReaderSettingsStepper,
} from "./sharedReaderChrome/types";

export type ReaderPageTransition = "continuous" | "paged";
export type ReaderPdfLayout = "single" | "double";
export type ReaderRotateAction = "counterclockwise" | "clockwise" | "original";

/** Viewer state the PDF/comic display settings read (a subset of the Papyrus store). */
export interface ReaderFormatSettingsState {
  viewMode?: ViewMode;
  comicLayoutMode?: ComicLayoutMode;
  comicFitMode?: ComicFitMode;
  comicReadingDirection?: ComicReadingDirection;
}

/** Callbacks the groups invoke. Omit one to drop its group. */
export interface ReaderFormatSettingsSetters {
  onViewModeChange?: (viewMode: ViewMode) => void;
  onRotate?: (direction: "clockwise" | "counterclockwise") => void;
  /** Adds an "Original / 0°" button to the rotation row. */
  onResetRotation?: () => void;
  onComicLayoutModeChange?: (mode: ComicLayoutMode) => void;
  onComicFitModeChange?: (mode: ComicFitMode) => void;
  onComicReadingDirectionChange?: (direction: ComicReadingDirection) => void;
}

/** Page-by-page is the single-page view mode; double page counts as continuous. */
export const getPdfPageTransition = (viewMode: ViewMode | undefined): ReaderPageTransition =>
  viewMode === "single" ? "paged" : "continuous";

export const getPdfLayout = (viewMode: ViewMode | undefined): ReaderPdfLayout =>
  viewMode === "double" ? "double" : "single";

export const resolveTransitionViewMode = (
  current: ViewMode | undefined,
  transition: ReaderPageTransition,
): ViewMode => {
  if (transition === "paged") return "single";
  return current === "double" ? "double" : "continuous";
};

export const resolveLayoutViewMode = (
  current: ViewMode | undefined,
  layout: ReaderPdfLayout,
): ViewMode => {
  if (layout === "double") return "double";
  return current === "double" ? "continuous" : current ?? "continuous";
};

/**
 * PDF and comic display options as choice groups, for hosts that render the
 * reader settings in their own sheet (alongside getEpubTypographyGroups for
 * EPUB). Zoom is a stepper: see getReaderZoomStepper. Page theme and
 * appearance are not included; the host already owns those.
 *
 * PDF: page transition, layout (single/double), rotation (action buttons).
 * Comic: layout (single/continuous), fit (width/page), reading direction.
 * EPUB and text return [].
 */
export function getReaderFormatSettingsGroups(
  documentType: DocumentType,
  state: ReaderFormatSettingsState,
  setters: ReaderFormatSettingsSetters,
  locale: Locale | undefined,
): ReaderSettingsChoiceGroup[] {
  const t = getStrings(locale);
  const groups: ReaderSettingsChoiceGroup[] = [];

  if (documentType === "pdf") {
    const { onViewModeChange, onRotate, onResetRotation } = setters;
    if (onViewModeChange) {
      groups.push({
        key: "pageTransition",
        label: t.pageTransition,
        value: getPdfPageTransition(state.viewMode),
        options: [
          { value: "continuous", label: t.continuous },
          { value: "paged", label: t.pageByPage },
        ],
        onChange: (value) =>
          onViewModeChange(
            resolveTransitionViewMode(state.viewMode, value === "paged" ? "paged" : "continuous"),
          ),
      });
      groups.push({
        key: "layout",
        label: t.layout,
        value: getPdfLayout(state.viewMode),
        options: [
          { value: "single", label: t.singlePage },
          { value: "double", label: t.doublePage },
        ],
        onChange: (value) =>
          onViewModeChange(
            resolveLayoutViewMode(state.viewMode, value === "double" ? "double" : "single"),
          ),
      });
    }
    if (onRotate) {
      groups.push({
        key: "rotate",
        kind: "action",
        label: t.rotate,
        value: "",
        options: [
          { value: "counterclockwise", label: t.counterclockwise },
          ...(onResetRotation ? [{ value: "original", label: t.rotationOriginal }] : []),
          { value: "clockwise", label: t.clockwise },
        ],
        onChange: (value) => {
          if (value === "original") onResetRotation?.();
          else onRotate(value === "clockwise" ? "clockwise" : "counterclockwise");
        },
      });
    }
  }

  if (documentType === "comic") {
    const {
      onComicLayoutModeChange,
      onComicFitModeChange,
      onComicReadingDirectionChange,
    } = setters;
    if (onComicLayoutModeChange) {
      groups.push({
        key: "comicLayout",
        label: t.comicMode,
        value: state.comicLayoutMode ?? "single",
        options: [
          { value: "single", label: t.comicSingle },
          { value: "continuous", label: t.comicContinuous },
        ],
        onChange: (value) =>
          onComicLayoutModeChange(value === "continuous" ? "continuous" : "single"),
      });
    }
    if (onComicFitModeChange) {
      groups.push({
        key: "comicFit",
        label: t.comicFit,
        value: state.comicFitMode ?? "width",
        options: [
          { value: "width", label: t.comicFitWidth },
          { value: "page", label: t.comicFitPage },
        ],
        onChange: (value) => onComicFitModeChange(value === "page" ? "page" : "width"),
      });
    }
    if (onComicReadingDirectionChange) {
      groups.push({
        key: "comicDirection",
        label: t.comicDirection,
        value: state.comicReadingDirection ?? "ltr",
        options: [
          { value: "ltr", label: t.comicLtr },
          { value: "rtl", label: t.comicRtl },
        ],
        onChange: (value) => onComicReadingDirectionChange(value === "rtl" ? "rtl" : "ltr"),
      });
    }
  }

  return groups;
}

export const READER_ZOOM_MAX = 4;
export const READER_ZOOM_STEP = 0.1;
export const getReaderZoomMin = (documentType: DocumentType) =>
  documentType === "comic" ? 1 : 0.5;

/**
 * Zoom stepper for PDF and comics (null for EPUB/text, whose "zoom" is the
 * font size). Compatible with ReaderSettingsView's fontSize prop.
 */
export function getReaderZoomStepper(
  documentType: DocumentType,
  zoom: number,
  onZoomChange: (zoom: number) => void,
  locale: Locale | undefined,
): ReaderSettingsStepper | null {
  if (documentType !== "pdf" && documentType !== "comic") return null;
  const t = getStrings(locale);
  const min = getReaderZoomMin(documentType);
  const clamp = (value: number) =>
    Number(Math.max(min, Math.min(READER_ZOOM_MAX, value)).toFixed(2));
  return {
    key: "zoom",
    label: t.zoom,
    value: zoom,
    min,
    max: READER_ZOOM_MAX,
    step: READER_ZOOM_STEP,
    onChange: (value) => onZoomChange(clamp(value)),
    formattedValue: `${Math.round(zoom * 100)}%`,
    decreaseLabel: t.zoomOut,
    increaseLabel: t.zoomIn,
  };
}

type FormatEngine = Pick<DocumentEngine, "rotate" | "getRotation" | "setZoom">;
type DocumentStatePatch = Partial<{
  viewMode: ViewMode;
  rotation: number;
  zoom: number;
  comicLayoutMode: ComicLayoutMode;
  comicFitMode: ComicFitMode;
  comicReadingDirection: ComicReadingDirection;
}>;

/**
 * Setters wired to a Papyrus engine and the viewer store, i.e. what
 * Papyrus' own SettingsSheet does:
 *
 *   const store = useViewerStore();
 *   const setters = createReaderFormatSettingsSetters(engine, store.setDocumentState);
 *   getReaderFormatSettingsGroups(type, store, setters, store.locale);
 *   getReaderZoomStepper(type, store.zoom, setters.onZoomChange, store.locale);
 */
export function createReaderFormatSettingsSetters(
  engine: FormatEngine,
  setDocumentState: (patch: DocumentStatePatch) => void,
  options: { allowRotationReset?: boolean } = {},
): Required<Omit<ReaderFormatSettingsSetters, "onResetRotation">> &
  Pick<ReaderFormatSettingsSetters, "onResetRotation"> & {
    onZoomChange: (zoom: number) => void;
  } {
  const allowRotationReset = options.allowRotationReset ?? Platform?.OS === "ios";
  return {
    onViewModeChange: (viewMode) => setDocumentState({ viewMode }),
    onRotate: (direction) => {
      engine.rotate(direction);
      setDocumentState({ rotation: engine.getRotation() });
    },
    onResetRotation: allowRotationReset
      ? () => resetEngineRotation(engine, (rotation) => setDocumentState({ rotation }))
      : undefined,
    onComicLayoutModeChange: (comicLayoutMode) => setDocumentState({ comicLayoutMode }),
    onComicFitModeChange: (comicFitMode) => setDocumentState({ comicFitMode }),
    onComicReadingDirectionChange: (comicReadingDirection) =>
      setDocumentState({ comicReadingDirection }),
    onZoomChange: (zoom) => {
      engine.setZoom(zoom);
      setDocumentState({ zoom });
    },
  };
}

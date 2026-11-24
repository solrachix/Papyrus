import { useViewerStore } from "@papyrus-sdk/core";
import { resolveReaderSheetAppearance } from "./readerSheetPresentation";

/** Sheet theme/palette derived from the viewer's page theme. */
export function useReaderSheetAppearance() {
  const pageTheme = useViewerStore((state) => state.pageTheme);
  return resolveReaderSheetAppearance(pageTheme);
}

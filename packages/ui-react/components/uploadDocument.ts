import type {
  DocumentEngine,
  DocumentSource,
  OutlineItem,
} from "@papyrus-sdk/types";

export interface UploadDocumentState {
  isLoaded?: boolean;
  pageCount?: number;
  currentPage?: number;
  scrollToPageSignal?: number | null;
  outline?: OutlineItem[];
}

export type UploadDocumentStateSetter = (
  state: UploadDocumentState
) => void;

export async function loadDocumentFromUpload(
  engine: DocumentEngine,
  source: DocumentSource,
  setDocumentState: UploadDocumentStateSetter
): Promise<void> {
  setDocumentState({ isLoaded: false });

  try {
    await engine.load(source);
    const pageCount = engine.getPageCount();

    setDocumentState({
      isLoaded: true,
      pageCount,
      currentPage: 1,
      scrollToPageSignal: 0,
    });

    try {
      const outline = await engine.getOutline();
      setDocumentState({ outline });
    } catch (error) {
      console.error("Outline loading failed", error);
    }
  } catch (error) {
    console.error("Upload failed", error);
    setDocumentState({ isLoaded: true });
  }
}

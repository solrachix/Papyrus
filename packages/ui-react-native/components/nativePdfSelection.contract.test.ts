import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const viewerSource = source("packages/ui-react-native/components/Viewer.tsx");
const nativeViewerSource = source(
  "packages/ui-react-native/components/NativePdfDocumentViewer.tsx"
);
const iosViewerSource = source(
  "packages/ui-react-native/components/DedicatedIosPdfViewer.tsx"
);
const publicApiSource = source("packages/ui-react-native/index.ts");

describe("native iOS PDF selection contract", () => {
  it("exposes and forwards text selection callbacks through Viewer", () => {
    const propsSource = viewerSource.slice(
      viewerSource.indexOf("export interface ViewerProps"),
      viewerSource.indexOf("const LIST_TOP_PADDING")
    );

    expect(propsSource).toContain("onTextSelected?:");
    expect(propsSource).toContain("onDefineSelection?:");
    expect(publicApiSource).toContain(
      'export type { ViewerProps } from "./components/Viewer";'
    );
    expect(viewerSource).toContain("onTextSelected={onTextSelected}");
    expect(viewerSource).toContain("onDefineSelection={onDefineSelection}");
    expect(nativeViewerSource).toContain("onTextSelected={onTextSelected}");
    expect(nativeViewerSource).toContain("onDefineSelection={onDefineSelection}");
    expect(iosViewerSource).toContain("onTextSelected?.({ text, pageIndex });");
    expect(iosViewerSource).toContain("onDefineSelection?.({");
  });

  it("uses Papyrus clipboard support and offers Copy and Define actions", () => {
    expect(iosViewerSource).toContain('import Clipboard from "@react-native-clipboard/clipboard"');
    expect(iosViewerSource).toContain("copySelectionText(selection.text, Clipboard)");
    expect(iosViewerSource).toContain('accessibilityLabel="Copy selected text"');
    expect(iosViewerSource).toContain('accessibilityLabel="Define selected text"');
  });

  it("clears the PDFKit selection when the selection toolbar closes", () => {
    expect(iosViewerSource).toContain("selectionActive={selection !== null}");
  });
});

import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
const read = (p: string) => readFileSync(p, "utf8");
describe("native TXT annotations", () => {
  it("resizes the content container and restores long-press selection after async text arrives", () => {
    const android=read("packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusTextDocumentView.java");
    expect(android).toContain("containerParams.height = contentHeight");
    expect(android).toContain("textContainer.measure(contentWidthSpec, exactHeightSpec)");
    const load=android.slice(android.indexOf("private void reloadText()"),android.indexOf("private void requestTextContentLayout()"));
    expect(load).toContain("textView.setLongClickable(true)");
    expect(load).toContain("textView.setTextIsSelectable(true)");
  });
  it("exports annotation intent/tap and store-fed props on both platforms", () => {
    const ios = read("packages/engine-native/ios/PapyrusTextDocumentViewManager.m");
    const android = read("packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusTextDocumentViewManager.java");
    for (const key of ["annotations", "annotationLabels", "onAnnotateSelection", "onAnnotationTap"]) {expect(ios).toContain(key);expect(android).toContain(key);}
  });
  it("composes durable annotations and temporary search without changing source text", () => {
    const ios = read("packages/engine-native/ios/PapyrusTextDocumentView.m");
    const android = read("packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusTextDocumentView.java");
    expect(ios).toContain("applyAnnotationAttributes");expect(ios).toContain("NSUnderlineStyleAttributeName");
    expect(android).toContain("applyAnnotationSpans");expect(android).toContain("textView.getText() instanceof Spannable");expect(android).toContain("if (styled != textView.getText()) textView.setText");
  });
});

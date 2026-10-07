import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("native TXT and comic view registration contracts", () => {
  it("registers the native views and events on both mobile platforms", () => {
    const iosTextManager = read("packages/engine-native/ios/PapyrusTextDocumentViewManager.m");
    const iosComicManager = read("packages/engine-native/ios/PapyrusComicDocumentViewManager.m");
    const androidPackage = read("packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusPackage.java");
    const androidComicManager = read("packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusComicDocumentViewManager.java");

    expect(iosTextManager).toContain("RCT_EXPORT_MODULE(PapyrusTextDocumentView)");
    expect(iosTextManager).toContain("RCT_EXPORT_VIEW_PROPERTY(onTextRangeSelected");
    expect(iosComicManager).toContain("RCT_EXPORT_MODULE(PapyrusComicDocumentView)");
    expect(iosComicManager).toContain("RCT_EXPORT_VIEW_PROPERTY(onPageChanged");
    expect(iosComicManager).toContain("RCT_EXPORT_VIEW_PROPERTY(onZoomChanged");
    expect(androidPackage).toContain("new PapyrusTextDocumentViewManager()");
    expect(androidPackage).toContain("new PapyrusComicDocumentViewManager()");
    expect(androidComicManager).toContain('getName() { return "PapyrusComicDocumentView"; }');
    expect(androidComicManager).toContain('"onPageChanged"');
    expect(androidComicManager).toContain('"onZoomChanged"');
    expect(androidComicManager).toContain('"onError"');
  });

  it("exports generation-scoped native text and archive operations", () => {
    const iosModule = read("packages/engine-native/ios/PapyrusNativeEngine.m");
    const androidModule = read("packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusNativeEngineModule.java");
    const archive = read("packages/engine-native/vendor/libarchive/PapyrusComicArchive.cpp");

    for (const operation of ["loadText", "closeText", "searchTextRanges", "loadComic", "closeComic", "getComicPagePreview"]) {
      expect(iosModule).toContain(operation);
      expect(androidModule).toContain(` ${operation}(`);
    }
    expect(archive).toContain("archive_read_support_format_zip");
    expect(archive).toContain("archive_read_support_format_rar");
    expect(archive).toContain("archive_read_support_format_rar5");
    expect(archive).toContain("kMaximumExtractedPageCacheBytes = 80ULL * 1024ULL * 1024ULL");
    expect(archive).toContain("kMaximumEntryBytes = 64ULL * 1024ULL * 1024ULL");
  });

  it("retries Android TXT view loading when the document text arrives after native props", () => {
    const androidTextView = read("packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusTextDocumentView.java");
    const setter = androidTextView.match(/public void setTextLength\(int value\) \{([\s\S]*?)\n  \}\n\n  public void setCurrentTextOffset/)?.[1] ?? "";
    const reload = androidTextView.match(/private void reloadText\(\) \{([\s\S]*?)\n  private void applySearchHighlights/)?.[1] ?? "";

    expect(setter).toContain("reloadText()");
    expect(reload).toContain("scrollView.requestLayout()");
    expect(reload).toContain("requestTextContentLayout()");
  });

  it("measures Android TXT content to fit all laid out lines inside the ScrollView", () => {
    const androidTextView = read("packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusTextDocumentView.java");
    const selectableTextView = androidTextView.match(/private static final class PapyrusSelectableTextView extends TextView \{([\s\S]*?)\n  \}/)?.[1] ?? "";

    expect(selectableTextView).toContain("protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec)");
    expect(selectableTextView).toContain("layout.getHeight()");
    expect(selectableTextView).toContain("resolveSizeAndState(");
    expect(selectableTextView).toContain("setMeasuredDimension(getMeasuredWidth(), desiredHeight)");
    expect(androidTextView).toContain("params.height = contentHeight");
    expect(androidTextView).toContain("textView.measure(contentWidthSpec, contentHeightSpec)");
    expect(androidTextView).toContain("scrollView.addOnLayoutChangeListener");
  });

  it("preserves Android TXT reading offsets that arrive before the asynchronous text", () => {
    const androidTextView = read("packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusTextDocumentView.java");
    const setter = androidTextView.match(/public void setCurrentTextOffset\(int value\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    const reload = androidTextView.match(/private void reloadText\(\) \{([\s\S]*?)\n  private void requestTextContentLayout/)?.[1] ?? "";

    expect(setter).toContain("PapyrusNativeTextModel.clampRequestedTextOffset(value, expectedTextLength)");
    expect(setter).not.toContain("textView.length()");
    expect(reload).toContain("int initialOffset = currentTextOffset");
    expect(androidTextView).toContain("int safeOffset = Math.min(textView.length(), requestedOffset)");
  });

  it("applies proportional page height on Android comic bitmap cache hits", () => {
    const androidComicView = read("packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusComicDocumentView.java");
    const bind = androidComicView.match(/@Override public void onBindViewHolder\(@NonNull ComicHolder holder, int position\) \{([\s\S]*?)\n    \}\n    @Override public int getItemCount/)?.[1] ?? "";
    const cacheHit = bind.match(/if \(cached != null\) \{([\s\S]*?)\}/)?.[1] ?? "";

    expect(cacheHit).toContain("applyPageHeightForImage(holder, cached.getWidth(), cached.getHeight())");
    expect(bind).toContain("applyPageHeightForImage(holder, bounds.outWidth, bounds.outHeight)");
    expect(androidComicView).toContain("PapyrusComicPageLayout.itemHeight(");
  });

  it("bounds TXT and comic sources and rejects stale generation writes", () => {
    const androidModule = read("packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusNativeEngineModule.java");
    const iosModule = read("packages/engine-native/ios/PapyrusNativeEngine.m");
    const androidTextStore = read("packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusTextStore.java");
    const iosTextStore = read("packages/engine-native/ios/PapyrusTextStore.m");

    expect(androidModule).toContain("MAX_TEXT_SOURCE_BYTES = 64L * 1024L * 1024L");
    expect(androidModule).toContain("MAX_COMIC_ARCHIVE_BYTES = 512L * 1024L * 1024L");
    expect(androidModule).toContain("readAllBytes(input, MAX_TEXT_SOURCE_BYTES)");
    expect(androidModule).toContain("writeStreamToFile(inputStream, out, maxBytes)");
    expect(iosModule).toContain("kPapyrusMaximumTextSourceBytes = 64ULL * 1024ULL * 1024ULL");
    expect(iosModule).toContain("kPapyrusMaximumComicArchiveBytes = 512ULL * 1024ULL * 1024ULL");
    expect(iosModule).toContain("startAccessingSecurityScopedResource");
    expect(iosModule).toContain("didWriteData:(int64_t)bytesWritten totalBytesWritten:(int64_t)totalBytesWritten");
    expect(iosModule).toContain("self.exceededLimit = YES;");
    expect(iosModule).toContain("[downloadTask cancel]");
    expect(iosModule).toContain("PapyrusDownloadURLWithLimit(url, kPapyrusMaximumComicArchiveBytes");
    expect(iosModule).toContain("PapyrusDownloadURLWithLimit(url, kPapyrusMaximumTextSourceBytes");
    expect(androidTextStore).toContain("generation <= CLOSED_GENERATIONS.getOrDefault(engineId, -1)");
    expect(iosTextStore).toContain("generation > closedGeneration");
  });

  it("ships the archive sources required by CMake and CocoaPods", () => {
    const podspec = read("packages/engine-native/ios/PapyrusNativeEngine.podspec");
    const cmake = read("packages/engine-native/android/src/main/cpp/CMakeLists.txt");
    const packageJson = read("packages/engine-native/package.json");

    expect(podspec).toContain("archive_read_support_format_rar5.c");
    expect(podspec).toContain("archive_read_support_format_zip.c");
    expect(cmake).toContain("PapyrusComicArchiveJni.cpp");
    expect(cmake).toContain("PapyrusArchiveConfig.h");
    expect(packageJson).toContain("vendor/libarchive");
    expect(packageJson).toContain("third_party_licenses");
  });

  it("keeps comic zoom state synchronized and supports width-fit single pages", () => {
    const engine = read("packages/engine-native/index.ts");
    const viewer = read("packages/ui-react-native/components/NativeComicDocumentViewer.tsx");
    const iosComicView = read("packages/engine-native/ios/PapyrusComicDocumentView.m");
    const androidComicView = read("packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusComicDocumentView.java");

    expect(engine).toContain("setZoom(zoom: number): void { this.zoom = Math.max(1, Math.min(5, zoom)); }");
    expect(engine).toContain("getZoom(): number { return this.zoom; }");
    expect(viewer).toContain("nativeEngine.setZoom(nextZoom);");
    expect(iosComicView).toContain("fitWidthInSingleMode");
    expect(androidComicView).toContain('"single".equals(layoutMode) && "width".equals(fitMode)');
    expect(androidComicView).toContain("protected void onSizeChanged(int width, int height, int oldWidth, int oldHeight)");
    expect(androidComicView).toContain("adapter.notifyDataSetChanged()");
    expect(androidComicView).toContain("itemParams.width = Math.max(1, recyclerView.getWidth())");
    expect(androidComicView).toContain("itemParams.height = Math.max(1, recyclerView.getHeight())");
  });

  it("returns cached comic thumbnail file URIs without sending image data over the bridge", () => {
    const iosModule = read("packages/engine-native/ios/PapyrusNativeEngine.m");
    const androidModule = read("packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusNativeEngineModule.java");

    expect(iosModule).toContain("PapyrusComicThumbnails");
    expect(iosModule).toContain("NSURL fileURLWithPath");
    expect(androidModule).toContain("papyrus-comic-pages/thumbnails");
    expect(androidModule).toContain("Uri.fromFile(thumbnailFile).toString()");
    expect(androidModule).toContain("MAX_COMIC_THUMBNAIL_CACHE_BYTES = 16L * 1024L * 1024L");
    expect(iosModule).toContain("16ULL * 1024ULL * 1024ULL");
    expect(iosModule).toContain("kCGImageDestinationLossyCompressionQuality");
    expect(iosModule).not.toContain("data:image/jpeg;base64,");
    expect(androidModule).not.toContain("data:image/jpeg;base64,");
  });

  it("keeps Android comic zoom and pan on the bound ImageView instead of casting its ScrollView", () => {
    const androidComicView = read("packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusComicDocumentView.java");

    expect(androidComicView).toContain("recyclerView.getChildViewHolder(child)");
    expect(androidComicView).toContain("holder instanceof ComicHolder");
    expect(androidComicView).not.toContain("(ImageView)((FrameLayout) child).getChildAt(0)");
  });

  it("adds Define through UITextView's native text edit menu and preserves system actions", () => {
    const iosTextView = read("packages/engine-native/ios/PapyrusTextDocumentView.m");

    expect(iosTextView).toContain("textView:(UITextView *)textView");
    expect(iosTextView).toContain("editMenuForTextInRange:(NSRange)range");
    expect(iosTextView).toContain("suggestedActions");
    expect(iosTextView).not.toContain("[_textView addInteraction:_editMenuInteraction]");
  });

  it("reports phrase selections even when Define is restricted to one word", () => {
    const iosTextView = read("packages/engine-native/ios/PapyrusTextDocumentView.m");
    const selectionCallback = iosTextView.match(/- \(void\)textViewDidChangeSelection:\(UITextView \*\)textView \{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(selectionCallback).not.toContain("defineSelectionMode");
    expect(selectionCallback).toContain("self.lastReportedStart = -1");
    expect(selectionCallback).toContain("self.onTextRangeSelected(@{ @\"nativeEvent\": payload })");
    expect(iosTextView).toContain("return [self selectedRangePayload] != nil &&");
    expect(iosTextView).toContain("[self isSingleWordSelection]");
  });

  it("does not redeclare the public Define selection mode as readwrite in the class extension", () => {
    const iosTextHeader = read("packages/engine-native/ios/PapyrusTextDocumentView.h");
    const iosTextView = read("packages/engine-native/ios/PapyrusTextDocumentView.m");
    const classExtension = iosTextView.match(/@interface PapyrusTextDocumentView \(\)([\s\S]*?)@end/)?.[1] ?? "";

    expect(iosTextHeader).toContain("@property (nonatomic, copy) NSString *defineSelectionMode;");
    expect(classExtension).not.toContain("defineSelectionMode");
  });

  it("preserves iOS comic pan offset between drag gestures", () => {
    const iosComicView = read("packages/engine-native/ios/PapyrusComicDocumentView.m");

    expect(iosComicView).toContain("panGestureStartOffset = self.panOffset");
    expect(iosComicView).toContain("translation.x + self.panGestureStartOffset.x");
    expect(iosComicView).toContain("translation.y + self.panGestureStartOffset.y");
  });

  it("reapplies collection layout when reading direction changes dynamically", () => {
    const iosComicView = read("packages/engine-native/ios/PapyrusComicDocumentView.m");
    const directionSetter = iosComicView.match(/- \(void\)setReadingDirection:\(NSString \*\)value \{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(directionSetter).toContain("[self applyLayoutMode]");
    expect(directionSetter).toContain("[self.collectionView reloadData]");
    expect(directionSetter).toContain("[self scrollToCurrentPageAnimated:NO]");
  });

  it("closes stale comic loads using the engine identity that started the load", () => {
    const engine = read("packages/engine-native/index.ts");

    expect(engine).toContain("const engineId = this.engineId;");
    expect(engine).toContain("native.closeComic?.(engineId, generation);");
  });

  it("uses compact source mapping segments for long TXT search", () => {
    const androidModel = read("packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusNativeTextModel.java");
    const iosModule = read("packages/engine-native/ios/PapyrusNativeEngine.m");

    expect(androidModel).toContain("class MappingSegment");
    expect(androidModel).toContain("appendMappingSegment");
    expect(iosModule).toContain("PapyrusAppendTextMappingSegment");
    expect(iosModule).toContain("PapyrusSourceRangeForNormalizedOffset");
  });
});

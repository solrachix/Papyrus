import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SearchService, useViewerStore } from "@papyrus-sdk/core";
import type { DocumentEngine, DocumentType, ReaderSearchResult } from "@papyrus-sdk/types";
import { IconChevronLeft, IconChevronRight, IconClose, IconSearch } from "../icons";
import { getStrings } from "../mobileStrings";
import { resolveMobileChromeOffsets } from "./mobileChromeMetrics";
import { getSearchOverlayLayout } from "./searchOverlayLayout";
import { usePapyrusSafeAreaInsets } from "./PapyrusSafeArea";
import { NativeSheet, NativeSheetScrollView } from "./NativeSheet";
import { getReaderSheetPalette, toReaderSheetTheme } from "./readerSheetPresentation";
import { resolveEpubChapterTitle } from "./epubChapterLabel";
import { normalizeSearchSnippet, splitSearchSnippet } from "./searchSnippet";

type SearchOverlayProps = {
  engine: DocumentEngine;
  documentType: DocumentType;
  visible: boolean;
  onClose: () => void;
  /**
   * @deprecated Results are listed inside the search sheet now; kept so
   * existing hosts still compile. Not called.
   */
  onOpenResults?: () => void;
};

/**
 * Search as a bottom sheet: query field with a clear button and the result
 * list (chapter/page + snippet with the match highlighted). Tapping a result
 * jumps to it and collapses the sheet into a small bar with previous/next
 * navigation, so the page stays visible while stepping through matches.
 */
export function SearchOverlay({ engine, documentType, visible, onClose }: SearchOverlayProps) {
  const {
    activeSearchIndex,
    locale,
    nextSearchResult,
    prevSearchResult,
    searchQuery,
    searchResults,
    textSearchResults,
    isLoaded,
    pageCount,
    textLength,
    outline,
    setSearch,
    setDocumentState,
    triggerScrollToPage,
    triggerScrollToTextOffset,
    pageTheme,
    accentColor,
  } = useViewerStore();
  const [draft, setDraft] = useState(searchQuery);
  const [isSearching, setIsSearching] = useState(false);
  // No counters or empty state before the first search of this session.
  const [searched, setSearched] = useState(Boolean(searchQuery));
  const [navigating, setNavigating] = useState(false);
  // setSearch preselects result 0; only highlight a row the reader picked.
  const [picked, setPicked] = useState(false);
  const searchRequestIdRef = useRef(0);
  const { width: windowWidth } = useWindowDimensions();
  const overlayLayout = getSearchOverlayLayout(windowWidth);
  const offsets = resolveMobileChromeOffsets(usePapyrusSafeAreaInsets());
  const palette = getReaderSheetPalette(toReaderSheetTheme(pageTheme));
  const t = getStrings(locale);
  const searchService = useMemo(() => new SearchService(engine), [engine]);
  const results: ReaderSearchResult[] = documentType === "text" ? textSearchResults : searchResults;

  useEffect(() => {
    searchService.clearCache();
  }, [isLoaded, pageCount, searchService]);

  useEffect(() => {
    if (!visible) {
      setNavigating(false);
      return;
    }
    setDraft(searchQuery);
    setSearched(Boolean(searchQuery));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const resultLabel = (result: ReaderSearchResult) => {
    if ("kind" in result && result.kind === "text") {
      return `${t.progress} ${textLength <= 0 ? 0 : Math.round((result.location.start / textLength) * 100)}%`;
    }
    const pageIndex = (result as { pageIndex: number }).pageIndex;
    if (documentType === "epub") return resolveEpubChapterTitle(outline, pageIndex) ?? `${t.chapter} ${pageIndex + 1}`;
    if (documentType === "pdf") return `${t.page} ${pageIndex + 1}`;
    return `${t.progress} ${pageCount <= 1 ? 100 : Math.round(((pageIndex + 1) / pageCount) * 100)}%`;
  };

  const handleSubmit = async () => {
    const requestId = ++searchRequestIdRef.current;
    const query = draft.trim();
    if (!query) {
      setIsSearching(false);
      setSearched(false);
      setSearch("", []);
      return;
    }
    setIsSearching(true);
    setSearched(true);
    setPicked(false);
    try {
      const nextResults = await searchService.searchReader(query);
      if (requestId !== searchRequestIdRef.current) return;
      setSearch(query, nextResults);
    } finally {
      if (requestId === searchRequestIdRef.current) setIsSearching(false);
    }
  };

  const handleClear = () => {
    searchRequestIdRef.current += 1;
    setDraft("");
    setIsSearching(false);
    setSearched(false);
    setPicked(false);
    setSearch("", []);
  };

  const handleClose = () => {
    Keyboard.dismiss();
    searchRequestIdRef.current += 1;
    setSearch("", []);
    setNavigating(false);
    onClose();
  };

  const openResult = (result: ReaderSearchResult, index: number) => {
    Keyboard.dismiss();
    if ("kind" in result && result.kind === "text") {
      setDocumentState({ activeSearchIndex: index, currentTextOffset: result.location.start });
      triggerScrollToTextOffset(result.location.start);
    } else {
      const pageIndex = (result as { pageIndex: number }).pageIndex;
      setDocumentState({ activeSearchIndex: index, currentPage: pageIndex + 1 });
      triggerScrollToPage(pageIndex);
    }
    setNavigating(true);
  };

  if (!visible) return null;

  const renderSnippet = (text: string, numberOfLines?: number) => (
    <Text numberOfLines={numberOfLines} style={[styles.snippet, { color: palette.text }]}>
      {splitSearchSnippet(normalizeSearchSnippet(text), searchQuery).map((part, index) =>
        part.match ? (
          <Text key={index} style={[styles.match, { backgroundColor: `${accentColor}33`, color: palette.text }]}>
            {part.text}
          </Text>
        ) : (
          part.text
        ),
      )}
    </Text>
  );

  const activeResult = activeSearchIndex >= 0 ? results[activeSearchIndex] : undefined;
  const counter = results.length > 0 && activeSearchIndex >= 0 ? `${activeSearchIndex + 1}/${results.length}` : "";

  return (
    <>
      <NativeSheet
        visible={!navigating}
        onClose={handleClose}
        sheetTheme={toReaderSheetTheme(pageTheme)}
        maxHeight="82%"
        showHeader
        title={t.search}
        closeAccessibilityLabel={t.closeSearch}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetBody}>
          <View style={[styles.inputWrap, { backgroundColor: palette.elevatedSurface, borderColor: palette.divider }]}>
            <IconSearch size={16} color={palette.mutedText} />
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={t.searchPlaceholder}
              placeholderTextColor={palette.mutedText}
              style={[styles.input, { color: palette.text }]}
              autoFocus={!searchQuery}
              returnKeyType="search"
              onSubmitEditing={handleSubmit}
              accessibilityLabel={t.search}
              testID="papyrus-search-input"
            />
            {draft ? (
              <Pressable accessibilityRole="button" accessibilityLabel={t.clearSearch} hitSlop={8} onPress={handleClear} style={[styles.clearButton, { backgroundColor: palette.closeSurface }]}>
                <IconClose size={12} color={palette.text} strokeWidth={2.4} />
              </Pressable>
            ) : null}
          </View>
          {draft.trim() && draft.trim() !== searchQuery ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t.searchGo} onPress={handleSubmit} testID="papyrus-search-run" style={[styles.goButton, { backgroundColor: accentColor }]}>
              <Text style={styles.goText}>{t.searchGo}</Text>
            </Pressable>
          ) : null}
          {isSearching ? (
            <Text style={[styles.meta, { color: palette.mutedText }]}>{t.searching}</Text>
          ) : searched && searchQuery ? (
            <Text style={[styles.meta, { color: palette.mutedText }]}>
              {results.length > 0 ? `${results.length} ${t.results}` : t.noResults}
            </Text>
          ) : (
            <Text style={[styles.meta, { color: palette.mutedText }]}>{t.searchHint}</Text>
          )}
          <NativeSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list} testID="papyrus-search-results">
            {!isSearching && searched
              ? results.map((result, index) => {
                  const active = picked && index === activeSearchIndex;
                  return (
                    <Pressable
                      key={"kind" in result ? `text-${result.location.start}-${index}` : `page-${result.pageIndex}-${index}`}
                      accessibilityRole="button"
                      accessibilityLabel={`${resultLabel(result)}: ${normalizeSearchSnippet(result.text)}`}
                      onPress={() => {
                        setPicked(true);
                        openResult(result, index);
                      }}
                      style={[styles.result, { borderBottomColor: palette.divider }, active && { backgroundColor: palette.activeSurface }]}
                    >
                      <Text numberOfLines={1} style={[styles.resultLabel, { color: accentColor }]}>{resultLabel(result)}</Text>
                      {renderSnippet(result.text, 3)}
                    </Pressable>
                  );
                })
              : null}
          </NativeSheetScrollView>
        </KeyboardAvoidingView>
      </NativeSheet>
      {navigating && activeResult ? (
        <View pointerEvents="box-none" style={[styles.navigatorFrame, overlayLayout.frame, { bottom: offsets.search, paddingLeft: Math.max(overlayLayout.frame.paddingHorizontal, offsets.left), paddingRight: Math.max(overlayLayout.frame.paddingHorizontal, offsets.right) }]}>
          <View testID="papyrus-search-navigator" style={[styles.navigator, overlayLayout.card, { backgroundColor: palette.surface, borderColor: palette.divider }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={t.previousResult} disabled={results.length < 2} onPress={prevSearchResult} style={[styles.navButton, { backgroundColor: palette.elevatedSurface }, results.length < 2 && styles.disabled]}>
              <IconChevronLeft size={16} color={palette.text} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t.showResults} onPress={() => setNavigating(false)} style={styles.navigatorBody}>
              <Text numberOfLines={1} style={[styles.resultLabel, { color: accentColor }]}>
                {counter} · {resultLabel(activeResult)}
              </Text>
              {renderSnippet(activeResult.text, 1)}
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t.nextResult} disabled={results.length < 2} onPress={nextSearchResult} style={[styles.navButton, { backgroundColor: palette.elevatedSurface }, results.length < 2 && styles.disabled]}>
              <IconChevronRight size={16} color={palette.text} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t.closeSearch} onPress={handleClose} style={[styles.navButton, { backgroundColor: palette.closeSurface }]}>
              <IconClose size={14} color={palette.text} strokeWidth={2.2} />
            </Pressable>
          </View>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  sheetBody: { paddingHorizontal: 18, paddingBottom: 12, flexShrink: 1 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    minHeight: 46,
  },
  input: { flex: 1, fontSize: 15, minHeight: 44 },
  clearButton: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  goButton: { marginTop: 10, borderRadius: 12, minHeight: 40, alignItems: "center", justifyContent: "center" },
  goText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  meta: { fontSize: 12, marginTop: 12, marginBottom: 4 },
  list: { paddingBottom: 12 },
  result: { paddingVertical: 12, paddingHorizontal: 6, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4, borderRadius: 10 },
  resultLabel: { fontSize: 11, fontWeight: "800" },
  snippet: { fontSize: 14, lineHeight: 20 },
  // Background only: a bolder nested span is measured at the regular
  // width on Android, so the highlight stopped short of the last letter.
  match: {},
  navigatorFrame: { position: "absolute", left: 0, right: 0, zIndex: 24 },
  navigator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 20,
    borderWidth: 1,
    padding: 8,
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  navigatorBody: { flex: 1, minHeight: 40, justifyContent: "center", gap: 2 },
  navButton: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.4 },
});

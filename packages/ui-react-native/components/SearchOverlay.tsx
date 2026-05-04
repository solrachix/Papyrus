import React, { useEffect, useMemo, useState } from "react";
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SearchService, useViewerStore } from "@papyrus-sdk/core";
import { DocumentEngine, DocumentType } from "@papyrus-sdk/types";
import { IconChevronLeft, IconChevronRight, IconSearch } from "../icons";
import { getStrings } from "../mobileStrings";

type SearchOverlayProps = {
  engine: DocumentEngine;
  documentType: DocumentType;
  visible: boolean;
  onClose: () => void;
  onOpenResults: () => void;
};

export function SearchOverlay({
  engine,
  documentType,
  visible,
  onClose,
  onOpenResults,
}: SearchOverlayProps) {
  const {
    activeSearchIndex,
    locale,
    nextSearchResult,
    prevSearchResult,
    searchQuery,
    searchResults,
    setSearch,
    uiTheme,
    accentColor,
  } = useViewerStore();
  const [draft, setDraft] = useState(searchQuery);
  const [isSearching, setIsSearching] = useState(false);
  const isDark = uiTheme === "dark";
  const t = getStrings(locale);
  const searchService = useMemo(() => new SearchService(engine), [engine]);
  const currentCount =
    searchResults.length > 0 && activeSearchIndex >= 0
      ? activeSearchIndex + 1
      : 0;
  const targetLabel =
    documentType === "pdf"
      ? t.page
      : documentType === "epub"
      ? t.contents
      : t.progress;

  useEffect(() => {
    if (!visible) return;
    setDraft(searchQuery);
  }, [searchQuery, visible]);

  const handleSubmit = async () => {
    const query = draft.trim();
    if (!query) {
      setSearch("", []);
      return;
    }

    setIsSearching(true);
    try {
      const results = await searchService.search(query);
      setSearch(query, results);
    } finally {
      setIsSearching(false);
    }
  };

  const handleClose = () => {
    Keyboard.dismiss();
    setSearch("", []);
    onClose();
  };

  if (!visible) return null;

  return (
    <View pointerEvents="box-none" style={styles.frame}>
      <View
        style={[styles.card, isDark && styles.cardDark]}
        testID="papyrus-search-overlay"
      >
        <View style={styles.inputRow}>
          <View style={[styles.searchInputWrap, isDark && styles.searchInputWrapDark]}>
            <IconSearch size={16} color={isDark ? "#cbd5e1" : "#64748b"} />
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={t.searchPlaceholder}
              placeholderTextColor={isDark ? "#94a3b8" : "#6b7280"}
              style={[styles.input, isDark && styles.inputDark]}
              autoFocus
              returnKeyType="search"
              onSubmitEditing={handleSubmit}
              accessibilityLabel="Search text"
            />
          </View>
          <Pressable
            onPress={handleClose}
            style={[styles.closeButton, isDark && styles.closeButtonDark]}
            accessibilityLabel="Close search"
          >
            <Text style={[styles.closeText, isDark && styles.closeTextDark]}>
              {t.cancel}
            </Text>
          </Pressable>
        </View>

        <View style={styles.metaRow}>
          <Pressable
            onPress={prevSearchResult}
            disabled={searchResults.length === 0}
            style={[
              styles.navButton,
              isDark && styles.navButtonDark,
              searchResults.length === 0 && styles.navButtonDisabled,
            ]}
            accessibilityLabel="Previous result"
          >
            <IconChevronLeft size={16} color={isDark ? "#e5e7eb" : "#111827"} />
          </Pressable>
          <Text style={[styles.metaText, isDark && styles.metaTextDark]}>
            {isSearching
              ? t.searching
              : `${currentCount}/${searchResults.length} ${targetLabel}`}
          </Text>
          <Pressable
            onPress={nextSearchResult}
            disabled={searchResults.length === 0}
            style={[
              styles.navButton,
              isDark && styles.navButtonDark,
              searchResults.length === 0 && styles.navButtonDisabled,
            ]}
            accessibilityLabel="Next result"
          >
            <IconChevronRight size={16} color={isDark ? "#e5e7eb" : "#111827"} />
          </Pressable>
        </View>

        <View style={styles.actionsRow}>
          <Pressable
            onPress={handleSubmit}
            style={[styles.primaryAction, { backgroundColor: accentColor }]}
            accessibilityLabel="Run search"
          >
            <Text style={styles.primaryActionText}>{t.searchGo}</Text>
          </Pressable>
          <Pressable
            onPress={onOpenResults}
            disabled={searchResults.length === 0}
            style={[
              styles.secondaryAction,
              isDark && styles.secondaryActionDark,
              searchResults.length === 0 && styles.navButtonDisabled,
            ]}
            accessibilityLabel="Open all results"
          >
            <Text
              style={[
                styles.secondaryActionText,
                isDark && styles.secondaryActionTextDark,
              ]}
            >
              {t.allResults}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 20,
    zIndex: 24,
    paddingHorizontal: 12,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
    backgroundColor: "rgba(255,255,255,0.94)",
    padding: 12,
    gap: 10,
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  cardDark: {
    backgroundColor: "rgba(15,17,21,0.94)",
    borderColor: "rgba(71,85,105,0.48)",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInputWrap: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInputWrapDark: {
    backgroundColor: "#111827",
    borderColor: "#1f2937",
  },
  input: {
    flex: 1,
    minHeight: 32,
    fontSize: 13,
    color: "#111827",
  },
  inputDark: {
    color: "#f8fafc",
  },
  closeButton: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#f1f5f9",
  },
  closeButtonDark: {
    backgroundColor: "#0f172a",
  },
  closeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },
  closeTextDark: {
    color: "#e2e8f0",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metaText: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    paddingHorizontal: 8,
  },
  metaTextDark: {
    color: "#cbd5e1",
  },
  navButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  navButtonDark: {
    backgroundColor: "#111827",
  },
  navButtonDisabled: {
    opacity: 0.45,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  primaryAction: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryActionText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 12,
  },
  secondaryAction: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
  },
  secondaryActionDark: {
    backgroundColor: "#0f172a",
  },
  secondaryActionText: {
    color: "#334155",
    fontWeight: "700",
    fontSize: 12,
  },
  secondaryActionTextDark: {
    color: "#e2e8f0",
  },
});

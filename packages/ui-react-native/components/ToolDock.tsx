import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useViewerStore } from "@papyrus-sdk/core";
import { getStrings } from "../strings";
import { IconEdit } from "../icons";
import {
  getToolDockDismissState,
  isToolDockToolSelected,
} from "../gesture/selectionInteraction";

const COLOR_SWATCHES = [
  "#fbbf24",
  "#f97316",
  "#ef4444",
  "#10b981",
  "#22d3ee",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f3f4f6",
  "#111827",
];

const TOOL_OPTIONS = [
  { id: "select", label: "select" },
  { id: "highlight", label: "highlight" },
  { id: "underline", label: "underline" },
  { id: "squiggly", label: "squiggly" },
  { id: "strikeout", label: "strikeout" },
  { id: "ink", label: "ink" },
  { id: "comment", label: "note" },
] as const;

const ToolDock: React.FC = () => {
  const {
    uiTheme,
    locale,
    annotationColor,
    setAnnotationColor,
    accentColor,
    activeTool,
    interactionMode,
    toolDockOpen,
    setDocumentState,
  } = useViewerStore();
  const isDark = uiTheme === "dark";
  const t = getStrings(locale);

  return (
    <View pointerEvents="box-none" style={styles.root}>
      {toolDockOpen ? (
        <View style={[styles.container, isDark && styles.containerDark]}>
          <View style={styles.header}>
            <Text style={[styles.title, isDark && styles.titleDark]}>
              {t.tools}
            </Text>
            <Pressable
              onPress={() =>
                setDocumentState(
                  getToolDockDismissState({
                    activeTool,
                    interactionMode,
                  })
                )
              }
              style={[styles.closeButton, isDark && styles.closeButtonDark]}
            >
              <Text
                style={[styles.closeLabel, isDark && styles.closeLabelDark]}
              >
                x
              </Text>
            </Pressable>
          </View>

          <View style={styles.toolsRow}>
            {TOOL_OPTIONS.map((tool) => {
              const isSelected = isToolDockToolSelected({
                toolId: tool.id,
                activeTool,
                interactionMode,
              });
              const label =
                tool.label === "note"
                  ? t.note
                  : tool.label === "select"
                  ? t.select
                  : tool.label === "underline"
                  ? t.underline
                  : tool.label === "squiggly"
                  ? t.squiggly
                  : tool.label === "strikeout"
                  ? t.strikeout
                  : tool.label === "ink"
                  ? t.ink
                  : t.highlight;
              return (
                <Pressable
                  key={tool.id}
                  onPress={() => {
                    if (tool.id === "select") {
                      const shouldArmSelection =
                        activeTool !== "select" || interactionMode !== "select";
                      setDocumentState({
                        activeTool: "select",
                        interactionMode: shouldArmSelection ? "select" : "pan",
                      });
                      return;
                    }
                    setDocumentState({
                      activeTool: tool.id,
                      interactionMode: "pan",
                    });
                  }}
                  style={[
                    styles.toolButton,
                    isDark && styles.toolButtonDark,
                    isSelected && { backgroundColor: accentColor },
                  ]}
                >
                  <Text
                    style={[
                      styles.toolText,
                      isDark && styles.toolTextDark,
                      isSelected && styles.toolTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.paletteTitle, isDark && styles.titleDark]}>
            {t.color}
          </Text>
          <View style={styles.paletteRow}>
            {COLOR_SWATCHES.map((color) => {
              const isSelected = annotationColor === color;
              return (
                <Pressable
                  key={color}
                  onPress={() => setAnnotationColor(color)}
                  style={[
                    styles.swatch,
                    { backgroundColor: color },
                    isSelected && styles.swatchSelected,
                    isSelected && { borderColor: accentColor },
                  ]}
                />
              );
            })}
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => setDocumentState({ toolDockOpen: true })}
          style={[styles.fab, isDark && styles.fabDark]}
        >
          <IconEdit size={16} color={isDark ? "#e5e7eb" : "#111827"} />
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "flex-end",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingBottom: 72,
  },
  fab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
  },
  fabDark: {
    backgroundColor: "#111827",
    borderColor: "#374151",
  },
  container: {
    width: "100%",
    maxWidth: 440,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000000",
    shadowOpacity: 0.15,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  containerDark: {
    backgroundColor: "#0f1115",
    borderColor: "#1f2937",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  closeButton: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
  },
  closeButtonDark: {
    backgroundColor: "#111827",
  },
  closeLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
  },
  closeLabelDark: {
    color: "#e5e7eb",
  },
  title: {
    fontSize: 11,
    fontWeight: "800",
    color: "#111827",
  },
  titleDark: {
    color: "#e5e7eb",
  },
  toolsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 8,
  },
  toolButton: {
    marginRight: 6,
    marginBottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#f9fafb",
  },
  toolButtonDark: {
    borderColor: "#374151",
    backgroundColor: "#111827",
  },
  toolText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#111827",
  },
  toolTextDark: {
    color: "#e5e7eb",
  },
  toolTextActive: {
    color: "#ffffff",
  },
  paletteTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: "#4b5563",
    marginBottom: 6,
  },
  paletteRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  swatch: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  swatchSelected: {
    borderColor: "#2563eb",
    borderWidth: 2,
  },
});

export default ToolDock;
